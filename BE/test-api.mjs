const response = await fetch("http://localhost:3001/api/products?page=1&pageSize=5");
const data = await response.json();

console.log("API Response Status:", response.status);
console.log("Total Items:", data.items?.length || 0);
console.log("Sample Products:");
data.items?.slice(0, 3).forEach(p => {
  console.log(`  #${p.id}: ${p.name}`);
  console.log(`    Primary Image: ${p.imageUrl}`);
  console.log(`    Stock: ${p.stockQuantity}`);
});
