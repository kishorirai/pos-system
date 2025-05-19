
/**
 * Sales Page
 * Manages sales transactions with functionality to create new sales,
 * view sales history, and analyze sales data through different tabs.
 */

import React, { useState } from 'react';
import MainLayout from '../components/layout/MainLayout';
import { CompanyProvider } from '../contexts/CompanyContext';
import { InventoryProvider } from '../contexts/InventoryContext';
import { SalesProvider } from '../contexts/SalesContext';
import EnhancedSaleForm from '../components/sales/EnhancedSaleForm';
import SalesList from '../components/sales/SalesList';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Sales = () => {
  const [activeTab, setActiveTab] = useState('list');

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-tight">Sales</h2>
        </div>

        <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="list">Sales List</TabsTrigger>
            <TabsTrigger value="new">New Sale</TabsTrigger>
          </TabsList>
          
          <TabsContent value="list" className="space-y-4">
            <SalesList />
          </TabsContent>
          
          <TabsContent value="new" className="space-y-4">
            <EnhancedSaleForm />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
};

const SalesPage = () => (
  <CompanyProvider>
    <InventoryProvider>
      <SalesProvider>
        <Sales />
      </SalesProvider>
    </InventoryProvider>
  </CompanyProvider>
);

export default SalesPage;
