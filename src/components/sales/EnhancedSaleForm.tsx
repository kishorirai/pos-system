import React, { useState, useEffect, useMemo } from 'react';
import { useCompany } from '../../contexts/CompanyContext';
import { useInventory } from '../../contexts/InventoryContext';
import { useSales } from '../../contexts/SalesContext';
import { Item, SaleItem, Company } from '../../types';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShoppingCart, Plus, Trash2, Printer, FileText, AlertCircle, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { calculateExclusiveCost, calculateMRP, calculateFinalPrice } from '../../utils/pricingUtils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PrintBillModal } from './PrintBillModal';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronDown } from 'lucide-react';

// Define sales units
const SALES_UNITS = ['Case', 'Packet', 'Piece'];

// Define GST rates
const GST_RATES = [5, 12, 18, 28];

// HSN Codes (sample)
const HSN_CODES = [
  '0910', '1101', '1902', '2106', '3004',
  '3306', '3401', '3402', '3923', '4818',
  '6911', '7321', '8414', '8418', '8450',
  '8516', '8517', '8528', '9503'
];

// Define type for company summary
interface CompanySummary {
  id: string;
  name: string;
  subtotal: number;
  discount: number;
  gst: number;
  total: number;
}

const EnhancedSaleForm: React.FC = () => {
  const { companies, currentCompany } = useCompany();
  const { items, filteredItems, filteredGodowns } = useInventory();
  const { addSaleItem, currentSaleItems, removeSaleItem, createSale, clearSaleItems, validateCompanyItems, updateSaleItem: contextUpdateSaleItem } = useSales();

  // Form state
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(currentCompany?.id || '');
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [customerName, setCustomerName] = useState<string>('');
  const [selectedGodownId, setSelectedGodownId] = useState<string>('');
  const [salesUnit, setSalesUnit] = useState<string>('Piece');
  const [mrp, setMrp] = useState<number>(0);
  const [exclusiveCost, setExclusiveCost] = useState<number>(0);
  const [gstRate, setGstRate] = useState<number>(0);
  const [gstAmount, setGstAmount] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'amount' | 'percentage'>('amount');
  const [companyFilteredItems, setCompanyFilteredItems] = useState<Item[]>([]);
  const [hsnCode, setHsnCode] = useState<string>('');
  const [packagingDetails, setPackagingDetails] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isItemPopoverOpen, setIsItemPopoverOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Discount dialog state
  const [isDiscountDialogOpen, setIsDiscountDialogOpen] = useState<boolean>(false);
  const [discountItemIndex, setDiscountItemIndex] = useState<number>(-1);
  const [dialogDiscount, setDialogDiscount] = useState<number>(0);
  const [dialogDiscountType, setDialogDiscountType] = useState<'amount' | 'percentage'>('amount');

  // Bill modal state
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printType, setPrintType] = useState<'single' | 'all' | 'consolidated'>('all');
  const [createdSale, setCreatedSale] = useState<any>(null);
  const [consolidatedPreviewOpen, setConsolidatedPreviewOpen] = useState(false);

  // Summary calculations
  const [subtotal, setSubtotal] = useState<number>(0);
  const [totalGst, setTotalGst] = useState<number>(0);
  const [totalDiscount, setTotalDiscount] = useState<number>(0);
  const [grandTotal, setGrandTotal] = useState<number>(0);

  // Calculate company summaries for the bill
 const companySummaries = useMemo(() => {
  const summaries: Record<string, CompanySummary> = {};

  // Return empty if no sale items
  if (!currentSaleItems || currentSaleItems.length === 0) {
    return summaries;
  }

  currentSaleItems.forEach(item => {
    // 🔧 FIX 1: Ensure the company summary object is properly created
    if (!summaries[item.companyId]) {
      const company = companies?.find(c => c.id === item.companyId);
      summaries[item.companyId] = {
        id: item.companyId,
        name: company ? company.name : 'Unknown Company',
        subtotal: 0,
        discount: 0,
        gst: 0,
        total: 0
      }; // ✅ 🔧 FIX 2: Previously missing closing braces here
    }

    // 🔧 FIX 3: This block was previously missing entirely due to the syntax break
    const summary = summaries[item.companyId];
    const baseAmount = item.unitPrice * item.quantity;
    const discountAmount = item.discountValue || 0;
    const gstAmount = item.gstAmount || 0;

    summary.subtotal += baseAmount;
    summary.discount += discountAmount;
    summary.gst += gstAmount;
    summary.total += item.totalPrice;
  });
  
    return summaries;
  }, [currentSaleItems, companies]);

  // Create a filtered items list for search
  const filteredSearchItems = useMemo(() => {
    if (!searchTerm || !companyFilteredItems || companyFilteredItems.length === 0) {
      return companyFilteredItems || [];
    }
    
    const lowerSearchTerm = searchTerm.toLowerCase();
    return companyFilteredItems.filter(item => 
      (item.name && item.name.toLowerCase().includes(lowerSearchTerm)) || 
      (item.itemId && item.itemId.toLowerCase().includes(lowerSearchTerm)) || 
      (item.hsnCode && item.hsnCode.toLowerCase().includes(lowerSearchTerm))
    );
  }, [searchTerm, companyFilteredItems]);

  // Set loading state
  useEffect(() => {
    const hasCompanies = companies && companies.length > 0;
    const hasItems = items && items.length > 0;
    const hasGodowns = filteredGodowns && filteredGodowns.length > 0;
    
    setIsLoading(!(hasCompanies && hasItems && hasGodowns));
  }, [companies, items, filteredGodowns]);

  // Initialize godown selection
  useEffect(() => {
    if (filteredGodowns && filteredGodowns.length > 0 && !selectedGodownId) {
      setSelectedGodownId(filteredGodowns[0].id);
    }
  }, [filteredGodowns, selectedGodownId]);

  // Filter items by selected company
  useEffect(() => {
    if (selectedCompanyId && items) {
      const itemsFromCompany = items.filter(item => item.companyId === selectedCompanyId);
      setCompanyFilteredItems(itemsFromCompany);
    } else {
      setCompanyFilteredItems([]);
    }
    
    // Reset selected item when company changes
    setSelectedItemId('');
    setSelectedItem(null);
    setMrp(0);
    setExclusiveCost(0);
    setGstRate(0);
    setHsnCode('');
    setPackagingDetails('');
    setSearchTerm('');
  }, [selectedCompanyId, items]);

  // Update item details when item selection changes
  useEffect(() => {
    if (selectedItemId && companyFilteredItems && companyFilteredItems.length > 0) {
      const item = companyFilteredItems.find((item) => item.id === selectedItemId);
      
      if (item) {
        setSelectedItem(item);
        
        // Set GST rate based on company and item
        let itemGstRate = item.type === 'GST' ? (item.gstPercentage || 0) : 0;
        setGstRate(itemGstRate);
        
        // Set HSN code if available
        setHsnCode(item.hsnCode || '');
        
        // Calculate prices based on GST rate
        if (itemGstRate > 0) {
          if (item.mrp) {
            // If MRP is provided, calculate exclusive cost
            setMrp(item.mrp);
            const calculatedExclusiveCost = calculateExclusiveCost(item.mrp, itemGstRate);
            setExclusiveCost(calculatedExclusiveCost);
            
            // Calculate GST amount
            const calculatedGstAmount = item.mrp - calculatedExclusiveCost;
            setGstAmount(calculatedGstAmount * quantity);
          } else {
            // If MRP is not provided, calculate it from unit price (assuming unit price is exclusive)
            setExclusiveCost(item.unitPrice);
            const calculatedMrp = calculateMRP(item.unitPrice, itemGstRate);
            setMrp(calculatedMrp);
            
            // Calculate GST amount
            const calculatedGstAmount = calculatedMrp - item.unitPrice;
            setGstAmount(calculatedGstAmount * quantity);
          }
        } else {
          // For NON-GST items, MRP is same as unit price
          setExclusiveCost(item.unitPrice);
          setMrp(item.unitPrice);
          setGstAmount(0);
        }
      } else {
        setSelectedItem(null);
        setMrp(0);
        setExclusiveCost(0);
        setGstRate(0);
        setGstAmount(0);
        setHsnCode('');
      }
    }
  }, [selectedItemId, companyFilteredItems, quantity]);

  // Handle MRP change
  const handleMrpChange = (value: number) => {
    setMrp(value);
    if (gstRate > 0) {
      const newExclusiveCost = calculateExclusiveCost(value, gstRate);
      setExclusiveCost(newExclusiveCost);
      
      const newGstAmount = value - newExclusiveCost;
      setGstAmount(newGstAmount * quantity);
    } else {
      setExclusiveCost(value);
      setGstAmount(0);
    }
  };
  
  // Handle adding item to bill
  const handleAddItem = () => {
    if (!selectedItem) {
      toast.error('Please select an item');
      return;
    }

    if (quantity <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }

    // Validate HSN code for Mansan items
    if (!hsnCode) {
      toast.error('HSN Code is required for items with GST');
      return;
    }

    // Calculate discount amount
    let discountValue = 0;
    let discountPercentage = 0;
    
    if (discount > 0) {
      if (discountType === 'amount') {
        discountValue = discount;
        discountPercentage = (discount / (exclusiveCost * quantity)) * 100;
      } else {
        discountPercentage = discount;
        discountValue = (exclusiveCost * quantity * discount) / 100;
      }
    }
    
    // Calculate GST on discounted amount
    const baseAmount = exclusiveCost * quantity;
    const discountedBaseAmount = baseAmount - discountValue;
    let itemGstAmount = 0;
    
    if (gstRate > 0) {
      itemGstAmount = (discountedBaseAmount * gstRate) / 100;
    }
    
    // Calculate total price
    const totalPrice = discountedBaseAmount + itemGstAmount;

    // Create sale item
    const company = companies?.find(c => c.id === selectedCompanyId);
    const saleItem: SaleItem = {
      itemId: selectedItem.id,
      companyId: selectedCompanyId,
      companyName: company ? company.name : 'Unknown Company',
      name: selectedItem.name,
      quantity,
      unitPrice: exclusiveCost,
      mrp: mrp,
      salesUnit,
      gstPercentage: gstRate > 0 ? gstRate : undefined,
      gstAmount: itemGstAmount,
      discountValue: discountValue > 0 ? discountValue : undefined,
      discountPercentage: discountPercentage > 0 ? discountPercentage : undefined,
      totalPrice,
      totalAmount: totalPrice,
      hsnCode: hsnCode || undefined,
      packagingDetails: packagingDetails || undefined
    };

    try {
      addSaleItem(saleItem);
      
      // Reset form fields for next item
      setSelectedItemId('');
      setSelectedItem(null);
      setQuantity(1);
      setDiscount(0);
      setSearchTerm('');
      setIsItemPopoverOpen(false);
    } catch (error) {
      toast.error('Error adding item to sale');
      console.error('Error adding item to sale:', error);
    }
  };
  
  // Open discount dialog for an item
  const openDiscountDialog = (index: number) => {
    if (!currentSaleItems || index < 0 || index >= currentSaleItems.length) {
      toast.error('Invalid item selected');
      return;
    }
    
    const item = currentSaleItems[index];
    
    setDiscountItemIndex(index);
    
    if (item.discountValue) {
      setDialogDiscount(item.discountPercentage ? item.discountPercentage : item.discountValue);
      setDialogDiscountType(item.discountPercentage ? 'percentage' : 'amount');
    } else {
      setDialogDiscount(0);
      setDialogDiscountType('amount');
    }
    
    setIsDiscountDialogOpen(true);
  };
  
  // Apply discount to an item
  const applyItemDiscount = () => {
    if (discountItemIndex < 0 || !currentSaleItems || discountItemIndex >= currentSaleItems.length) return;
    
    const item = currentSaleItems[discountItemIndex];
    const updatedItem = { ...item };
    
    // Calculate discount
    let discountValue = 0;
    let discountPercentage = 0;
    
    const baseAmount = item.unitPrice * item.quantity;
    
    if (dialogDiscount > 0) {
      if (dialogDiscountType === 'amount') {
        discountValue = dialogDiscount;
        discountPercentage = (dialogDiscount / baseAmount) * 100;
      } else {
        discountPercentage = dialogDiscount;
        discountValue = (baseAmount * dialogDiscount) / 100;
      }
    }
    
    // Calculate GST on discounted amount
    const discountedBaseAmount = baseAmount - discountValue;
    let itemGstAmount = 0;
    
    if (item.gstPercentage) {
      itemGstAmount = (discountedBaseAmount * item.gstPercentage) / 100;
    }
    
    // Update item with new values
    updatedItem.discountValue = discountValue > 0 ? discountValue : undefined;
    updatedItem.discountPercentage = discountPercentage > 0 ? discountPercentage : undefined;
    updatedItem.gstAmount = itemGstAmount;
    updatedItem.totalPrice = discountedBaseAmount + itemGstAmount;
    updatedItem.totalAmount = updatedItem.totalPrice;
    
    try {
      // Use the updateSaleItem function from context if available, otherwise fallback
      if (typeof contextUpdateSaleItem === 'function') {
        contextUpdateSaleItem(discountItemIndex, updatedItem);
      } else {
        // This is a fallback in case updateSaleItem isn't provided by the context
        removeSaleItem(discountItemIndex);
        addSaleItem(updatedItem);
      }
      
      setIsDiscountDialogOpen(false);
      toast.success('Discount applied successfully');
    } catch (error) {
      toast.error('Error applying discount');
      console.error('Error applying discount:', error);
    }
  };

  // Calculate summary values whenever sale items change
  useEffect(() => {
    if (!currentSaleItems || currentSaleItems.length === 0) {
      setSubtotal(0);
      setTotalDiscount(0);
      setTotalGst(0);
      setGrandTotal(0);
      return;
    }
    
    let newSubtotal = 0;
    let newTotalDiscount = 0;
    let newTotalGst = 0;
    let newGrandTotal = 0;
    
    currentSaleItems.forEach(item => {
      const baseAmount = item.unitPrice * item.quantity;
      newSubtotal += baseAmount;
      newTotalDiscount += item.discountValue || 0;
      newTotalGst += item.gstAmount || 0;
      newGrandTotal += item.totalPrice;
    });
    
    setSubtotal(newSubtotal);
    setTotalDiscount(newTotalDiscount);
    setTotalGst(newTotalGst);
    setGrandTotal(newGrandTotal);
  }, [currentSaleItems]);
  
  // Handle create sale
  const handleCreateSale = () => {
    if (!currentSaleItems || currentSaleItems.length === 0) {
      toast.error('No items added to sale');
      return;
    }
    
    if (!customerName.trim()) {
      toast.error('Customer name is required');
      return;
    }
    
    if (!selectedGodownId) {
      toast.error('Please select a godown');
      return;
    }
    
    try {
      // Validate company-specific rules
      const validation = validateCompanyItems(currentSaleItems);
      if (!validation.valid) {
        toast.error(validation.errorMessage || 'Invalid items');
        return;
      }
      
      // Group items by company to create separate bills if needed
      const itemsByCompany: Record<string, SaleItem[]> = {};
      
      currentSaleItems.forEach(item => {
        if (!itemsByCompany[item.companyId]) {
          itemsByCompany[item.companyId] = [];
        }
        itemsByCompany[item.companyId].push(item);
      });
      
      // Create bills for each company
      const createdSales = [];
      
      for (const [companyId, items] of Object.entries(itemsByCompany)) {
        const company = companies?.find(c => c.id === companyId);
        const hasGst = items.some(item => item.gstPercentage && item.gstPercentage > 0);
        
        // Explicitly cast billType to the correct type
        const billType = hasGst ? 'GST' as const : 'NON-GST' as const;
        const billNumber = `${billType}-${Date.now()}`; // Generate a bill number
        
        const billData = {
          companyId,
          billNumber,
          date: new Date().toISOString(),
          customerName,
          billType,
          godownId: selectedGodownId,
          items,
          totalAmount: items.reduce((sum, item) => sum + item.totalPrice, 0)
        };
        
        const sale = createSale(billData);
        if (sale) {
          createdSales.push(sale);
        }
      }
      
      if (createdSales.length > 0) {
        // Set created sales for printing
        setCreatedSale(createdSales.length === 1 ? createdSales[0] : createdSales);
        
        // Ask user about printing
        setPrintType(createdSales.length === 1 ? 'single' : 'all');
        setIsPrintModalOpen(true);
        
        // Reset form
        setCustomerName('');
        clearSaleItems();
      }
    } catch (error) {
      toast.error('Error creating sale');
      console.error('Error creating sale:', error);
    }
  };
  
  // Handle preview consolidated bill
  const handlePreviewConsolidatedBill = () => {
    if (!currentSaleItems || currentSaleItems.length === 0) {
      toast.error('No items added to sale');
      return;
    }
    
    setConsolidatedPreviewOpen(true);
  };

  const getItemDisplayDetails = (item: Item) => {
    if (!item) return "";
    
    let details = item.name || "";
    if (item.type === 'GST' && item.gstPercentage) {
      details += ` (GST: ${item.gstPercentage}%)`;
    }
    details += ` - ₹${item.unitPrice !== undefined ? item.unitPrice : 0}`;
    return details;
  };

  // Add updateSaleItem if it doesn't exist in the context
  const updateSaleItem = (index: number, saleItem: SaleItem) => {
    if (typeof contextUpdateSaleItem === 'function') {
      contextUpdateSaleItem(index, saleItem);
      return;
    }
    
    // Fallback implementation
    try {
      const newItems = [...currentSaleItems];
      newItems[index] = saleItem;
      
      // Remove and add to simulate update
      removeSaleItem(index);
      addSaleItem(saleItem);
    } catch (error) {
      console.error('Error updating sale item:', error);
      toast.error('Failed to update item');
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <Card className="p-6 text-center">
        <p>Loading sales form...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Customer and Godown Info */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="customerName">Customer Name *</Label>
            <Input
              id="customerName"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Enter customer name"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="godown">Godown *</Label>
            <Select 
              value={selectedGodownId} 
              onValueChange={setSelectedGodownId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select godown" />
              </SelectTrigger>
              <SelectContent>
                {filteredGodowns && filteredGodowns.map((godown) => (
                  <SelectItem key={godown.id} value={godown.id}>
                    {godown.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>
      
      {/* Item Entry Form */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Add Item</h3>
        <div className="grid grid-cols-12 gap-3 mb-4">
          {/* Company Selection - 4 columns */}
          <div className="col-span-12 md:col-span-4">
            <Label htmlFor="company">Company</Label>
            <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a company" />
              </SelectTrigger>
              <SelectContent>
                {companies && companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Item Selection with Search - 5 columns */}
          <div className="col-span-12 md:col-span-5">
            <Label htmlFor="item">Item Name</Label>
            <Popover open={isItemPopoverOpen} onOpenChange={setIsItemPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={isItemPopoverOpen}
                  className="w-full justify-between"
                  disabled={!selectedCompanyId}
                >
                  {selectedItem ? getItemDisplayDetails(selectedItem) : (selectedCompanyId ? "Select an item" : "Select company first")}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0">
                <Command>
                  <CommandInput 
                    placeholder="Search items..." 
                    value={searchTerm}
                    onValueChange={setSearchTerm}
                    className="h-9"
                  />
                  <CommandEmpty>No items found.</CommandEmpty>
                  <CommandGroup>
                    {filteredSearchItems && filteredSearchItems.length > 0 ? filteredSearchItems.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={item.id}
                        onSelect={() => {
                          setSelectedItemId(item.id);
                          setIsItemPopoverOpen(false);
                          setSearchTerm('');
                        }}
                        className="flex items-center justify-between"
                      >
                        <div className="flex flex-col">
                          <span>{item.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {item.itemId} {item.type === 'GST' ? `(GST: ${item.gstPercentage}%)` : '(Non-GST)'} - ₹{item.unitPrice}
                          </span>
                        </div>
                        {item.id === selectedItemId && (
                          <CheckIcon className="h-4 w-4" />
                        )}
                      </CommandItem>
                    )) : null}
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="col-span-6 md:col-span-2">
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
            />
          </div>
          
          <div className="col-span-6 md:col-span-1">
            <Label htmlFor="salesUnit">Unit</Label>
            <Select value={salesUnit} onValueChange={setSalesUnit}>
              <SelectTrigger>
                <SelectValue placeholder="Unit" />
              </SelectTrigger>
              <SelectContent>
                {SALES_UNITS.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div>
            <Label htmlFor="mrp">MRP</Label>
            <Input
              id="mrp"
              type="number"
              min="0"
              step="0.01"
              value={mrp}
              onChange={(e) => handleMrpChange(parseFloat(e.target.value) || 0)}
            />
          </div>
          
          <div>
            <Label htmlFor="exclusiveCost">Excl. GST Rate</Label>
            <Input
              id="exclusiveCost"
              type="number"
              min="0"
              step="0.01"
              value={exclusiveCost}
              onChange={(e) => setExclusiveCost(parseFloat(e.target.value) || 0)}
            />
          </div>
          
          <div>
            <Label htmlFor="gstRate">GST Rate (%)</Label>
            <Select 
              value={gstRate.toString()} 
              onValueChange={(value) => setGstRate(parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select GST Rate" />
              </SelectTrigger>
              <SelectContent>
                {GST_RATES.map((rate) => (
                  <SelectItem key={rate} value={rate.toString()}>
                    {rate}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="gstAmount">GST Amount</Label>
            <Input
              id="gstAmount"
              type="number"
              value={gstAmount.toFixed(2)}
              readOnly
              className="bg-gray-50"
            />
          </div>
          
          <div>
            <Label htmlFor="totalAmount">Total Amount</Label>
            <Input
              id="totalAmount"
              type="number"
              value={(exclusiveCost * quantity + gstAmount).toFixed(2)}
              readOnly
              className="bg-gray-50"
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <Label htmlFor="hsnCode">HSN Code *</Label>
            <Select 
              value={hsnCode} 
              onValueChange={setHsnCode}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select HSN Code" />
              </SelectTrigger>
              <SelectContent>
                {HSN_CODES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">Required for items with GST</p>
          </div>
          
          <div>
            <Label htmlFor="packagingDetails">Packaging Details</Label>
            <Input
              id="packagingDetails"
              value={packagingDetails}
              onChange={(e) => setPackagingDetails(e.target.value)}
              placeholder="Optional details about packaging"
              maxLength={50} // Limit length to avoid overflow on thermal slip
            />
            <p className="text-xs text-gray-500 mt-1">Will appear on 2nd line in Estimate bill</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div>
            <Label htmlFor="perUnit">Per ({salesUnit})</Label>
            <Input
              id="perUnit"
              type="text"
              value={`₹${mrp.toFixed(2)}/${salesUnit}`}
              readOnly
              className="bg-gray-50"
            />
          </div>
          
          <div>
            <Label htmlFor="discount">Discount</Label>
            <div className="flex">
              <Input
                id="discount"
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                className="rounded-r-none"
              />
              <Select 
                value={discountType} 
                onValueChange={(value: 'amount' | 'percentage') => setDiscountType(value)}
              >
                <SelectTrigger className="w-20 rounded-l-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="amount">₹</SelectItem>
                  <SelectItem value="percentage">%</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="md:col-span-3 flex items-end">
            <Button 
              type="button" 
              onClick={handleAddItem}
              className="w-full"
              disabled={!selectedCompanyId || !selectedItemId || quantity <= 0}
            >
              <Plus size={16} className="mr-1" /> Add Item
            </Button>
          </div>
        </div>
        
        {/* Item stock info */}
        {selectedItem && (
          <div className="text-xs text-gray-600 mb-4">
            <p>In stock: {selectedItem.stockQuantity} units</p>
          </div>
        )}
        
        {/* Company-specific warnings */}
        {currentCompany?.name === 'Mansan Laal and Sons' && (
          <div className="flex items-center p-2 mb-4 text-amber-800 bg-amber-50 rounded border border-amber-200">
            <AlertCircle size={16} className="mr-2" />
            <p className="text-xs">Mansan Laal and Sons requires GST items with HSN codes only.</p>
          </div>
        )}
        
        {currentCompany?.name === 'Estimate' && (
          <div className="flex items-center p-2 mb-4 text-blue-800 bg-blue-50 rounded border border-blue-200">
            <AlertCircle size={16} className="mr-2" />
            <p className="text-xs">Estimate company only accepts Non-GST items.</p>
          </div>
        )}
      </Card>
      
      {/* Items Table */}
      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="text-center">Qty</TableHead>
              <TableHead className="text-right">MRP</TableHead>
              <TableHead className="text-right">Excl. GST</TableHead>
              <TableHead className="text-right">Discount</TableHead>
              <TableHead className="text-right">GST</TableHead>
              <TableHead className="text-right">Net Amount</TableHead>
              <TableHead className="text-center">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentSaleItems && currentSaleItems.length > 0 ? (
              currentSaleItems.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>{item.companyName}</TableCell>
                  <TableCell>
                    {item.name}
                    {item.hsnCode && (
                      <div className="text-xs text-gray-500">HSN: {item.hsnCode}</div>
                    )}
                    {item.packagingDetails && (
                      <div className="text-xs text-gray-500">{item.packagingDetails}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-center">{item.quantity} {item.salesUnit}</TableCell>
                  <TableCell className="text-right">₹{((item.mrp || item.unitPrice) || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    ₹{item.unitPrice.toFixed(2)} 
                    <div className="text-xs text-gray-500">
                      ₹{(item.unitPrice * item.quantity).toFixed(2)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {item.discountValue ? (
                      <>
                        ₹{item.discountValue.toFixed(2)}
                        {item.discountPercentage && (
                          <div className="text-xs text-gray-500">
                            {item.discountPercentage}%
                          </div>
                        )}
                      </>
                    ) : (
                      '₹0.00'
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.gstPercentage ? (
                      <>
                        {item.gstPercentage}%
                        <div className="text-xs text-gray-500">
                          ₹{(item.gstAmount || 0).toFixed(2)}
                        </div>
                      </>
                    ) : (
                      '0%'
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">₹{item.totalPrice.toFixed(2)}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openDiscountDialog(index)}
                        className="h-7 w-7 text-blue-600"
                        title="Apply Discount"
                      >
                        %
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSaleItem(index)}
                        className="h-7 w-7 text-red-500"
                        title="Remove Item"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                  No items added yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
      
      {/* Company-wise Summaries */}
      {currentSaleItems && currentSaleItems.length > 0 && Object.keys(companySummaries).length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Company-wise Summary</h3>
          <div className="grid gap-4">
            {Object.values(companySummaries).map((company, index) => (
              <div key={index} className="border rounded-md p-4">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-medium">{company.name}</h4>
                  <span className="font-bold">₹{company.total.toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">Subtotal:</span> ₹{company.subtotal.toFixed(2)}
                  </div>
                  <div>
                    <span className="text-gray-500">Discount:</span> ₹{company.discount.toFixed(2)}
                  </div>
                  <div>
                    <span className="text-gray-500">GST:</span> ₹{company.gst.toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      
      {/* Summary and Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label className="text-sm text-gray-600">Total Amount (Excl.)</Label>
                <div className="font-medium">₹{subtotal.toFixed(2)}</div>
              </div>
              
              <div className="space-y-1">
                <Label className="text-sm text-gray-600">Total Discount</Label>
                <div className="font-medium">₹{totalDiscount.toFixed(2)}</div>
              </div>
              
              <div className="space-y-1">
                <Label className="text-sm text-gray-600">Total GST</Label>
                <div className="font-medium">₹{totalGst.toFixed(2)}</div>
              </div>
              
              <div className="space-y-1">
                <Label className="text-sm text-gray-600 font-bold">Grand Total</Label>
                <div className="font-bold text-lg">₹{grandTotal.toFixed(2)}</div>
              </div>
            </div>
          </Card>
        </div>
        
        <div>
          <Card className="p-6">
            <div className="space-y-4">
              <Button 
                className="w-full"
                size="lg"
                disabled={currentSaleItems.length === 0 || !customerName || !selectedGodownId}
                onClick={handleCreateSale}
              >
                <ShoppingCart className="mr-2 h-4 w-4" />
                Create Bill
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full"
                onClick={handlePreviewConsolidatedBill}
                disabled={currentSaleItems.length === 0}
              >
                <FileText className="mr-2 h-4 w-4" />
                Preview Final Bill
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full"
                onClick={clearSaleItems}
                disabled={currentSaleItems.length === 0}
              >
                Clear All
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Discount Dialog */}
      <Dialog open={isDiscountDialogOpen} onOpenChange={setIsDiscountDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Apply Discount</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="discountValue">Discount Value</Label>
              <div className="flex">
                <Input
                  id="discountValue"
                  type="number"
                  min="0"
                  step="0.01"
                  value={dialogDiscount}
                  onChange={(e) => setDialogDiscount(parseFloat(e.target.value) || 0)}
                  className="rounded-r-none"
                />
                <RadioGroup 
                  value={dialogDiscountType} 
                  onValueChange={(value: 'amount' | 'percentage') => setDialogDiscountType(value as any)}
                  className="flex items-center border rounded-l-none border-l-0 p-2"
                >
                  <div className="flex items-center space-x-1 mr-3">
                    <RadioGroupItem value="amount" id="amount" />
                    <Label htmlFor="amount">₹</Label>
                  </div>
                  <div className="flex items-center space-x-1">
                    <RadioGroupItem value="percentage" id="percentage" />
                    <Label htmlFor="percentage">%</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDiscountDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applyItemDiscount}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Modal */}
      {isPrintModalOpen && createdSale && (
        <PrintBillModal 
          isOpen={isPrintModalOpen} 
          onClose={() => setIsPrintModalOpen(false)} 
          sale={createdSale} 
          printType={printType}
        />
      )}

      {/* Consolidated Bill Preview */}
      {consolidatedPreviewOpen && currentSaleItems && currentSaleItems.length > 0 && (
        <Dialog open={consolidatedPreviewOpen} onOpenChange={setConsolidatedPreviewOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Final Bill Preview</DialogTitle>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-auto">
              <div className="p-4 border rounded">
                <div className="text-center mb-4">
                  <h2 className="text-xl font-bold">Consolidated Bill</h2>
                  <p>Date: {new Date().toLocaleDateString()}</p>
                  <p>Customer: {customerName || "Guest"}</p>
                </div>
                
                {/* Group items by company */}
                {Object.values(companySummaries).map((company, index) => (
                  <div key={index} className="mb-6">
                    <h3 className="font-medium text-lg mb-2">{company.name}</h3>
                    <table className="w-full text-sm">
                      <thead className="border-b">
                        <tr>
                          <th className="py-1 text-left">Item</th>
                          <th className="py-1 text-center">Qty</th>
                          <th className="py-1 text-right">MRP</th>
                          <th className="py-1 text-right">Disc</th>
                          <th className="py-1 text-right">Excl.</th>
                          <th className="py-1 text-right">GST</th>
                          <th className="py-1 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentSaleItems.filter(item => item.companyId === company.id).map((item, idx) => (
                          <tr key={idx} className="border-b border-gray-200">
                            <td className="py-1">
                              {item.name}
                              {item.packagingDetails && (
                                <div className="text-xs text-gray-500">{item.packagingDetails}</div>
                              )}
                            </td>
                            <td className="py-1 text-center">{item.quantity}</td>
                            <td className="py-1 text-right">₹{((item.mrp || item.unitPrice) || 0).toFixed(2)}</td>
                            <td className="py-1 text-right">₹{(item.discountValue || 0).toFixed(2)}</td>
                            <td className="py-1 text-right">₹{(item.unitPrice * item.quantity).toFixed(2)}</td>
                            <td className="py-1 text-right">₹{(item.gstAmount || 0).toFixed(2)}</td>
                            <td className="py-1 text-right font-medium">₹{item.totalPrice.toFixed(2)}</td>
                          </tr>
                        ))}
                        <tr className="font-medium">
                          <td colSpan={6} className="py-1 text-right">Company Total:</td>
                          <td className="py-1 text-right">₹{company.total.toFixed(2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ))}
                
                {/* Summary */}
                <div className="border-t pt-4 mt-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-right text-sm">
                      <p>Total Quantity:</p>
                      <p>Total Excl. Cost:</p>
                      <p>Total Discount:</p>
                      <p>Total GST:</p>
                      <p>Round Off:</p>
                      <p className="font-bold">Grand Total:</p>
                    </div>
                    <div className="text-right text-sm">
                      <p>{currentSaleItems.reduce((sum, item) => sum + item.quantity, 0)}</p>
                      <p>₹{subtotal.toFixed(2)}</p>
                      <p>₹{totalDiscount.toFixed(2)}</p>
                      <p>₹{totalGst.toFixed(2)}</p>
                      <p>₹{(Math.round(grandTotal) - grandTotal).toFixed(2)}</p>
                      <p className="font-bold">₹{Math.round(grandTotal).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
                
                <div className="text-center mt-6 text-sm">
                  <p>Thank you for your business!</p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConsolidatedPreviewOpen(false)}>Close</Button>
              <Button onClick={handleCreateSale}>
                <Printer className="mr-2 h-4 w-4" />
                Create & Print Bill
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default EnhancedSaleForm;
