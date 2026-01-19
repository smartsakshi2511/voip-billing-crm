import { motion } from "framer-motion";


import StatCard from "../components/common/StatCard";

import { AlertTriangle, DollarSign, Package, TrendingUp } from "lucide-react";

// import ProductsTable from "../components/products/ProductsTable";
import DataTable from "../components/reuseable/DataTable";

const ProductsPage = () => {

  const columns = [
    { header: "Name", accessor: "name" },
    { header: "Category", accessor: "category" },
    { header: "Price", accessor: "price" },
    { header: "Stock", accessor: "stock" },
    { header: "Sales", accessor: "sales" },
  ];

  // Dummy data (ye baad me API se bhi laa sakte ho)
  const data = [
    { id: 1, name: "Wireless Earbuds", category: "Electronics", price: 59.99, stock: 143, sales: 1200 },
    { id: 2, name: "Leather Wallet", category: "Accessories", price: 39.99, stock: 89, sales: 800 },
    { id: 3, name: "Smart Watch", category: "Electronics", price: 199.99, stock: 56, sales: 650 },
    { id: 4, name: "Yoga Mat", category: "Fitness", price: 29.99, stock: 210, sales: 950 },
    { id: 5, name: "Coffee Maker", category: "Home", price: 79.99, stock: 78, sales: 720 },
  ];

	return (
		<div className='flex-1 overflow-auto relative z-10'>

			<main className='max-w-7xl mx-auto py-6 px-4 lg:px-8'>
			

				

				   <DataTable columns={columns} data={data} title="Product List"  />

				<div className='grid grid-col-1 lg:grid-cols-2 gap-8'>
					
				</div>
			</main>
		</div>
	);
};
export default ProductsPage;
