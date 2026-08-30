import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

test("authentication, roles, inventory, sale, and restock", async t => {
  const data=await mkdtemp(join(tmpdir(),"vboxstock-")),port=31991;
  const processHandle=spawn(process.execPath,["server.mjs"],{cwd:import.meta.dirname+"/..",env:{...process.env,DATA_DIR:data,PORT:String(port)}});
  t.after(()=>processHandle.kill());
  await new Promise((resolve,reject)=>{processHandle.stdout.on("data",chunk=>String(chunk).includes("listening")&&resolve());processHandle.on("error",reject)});
  const base=`http://127.0.0.1:${port}`;
  const request=async(path,options={})=>fetch(base+path,options);
  const login=async(username,password)=>{const response=await request("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username,password})});return{response,cookie:response.headers.get("set-cookie").split(";")[0]}};
  const jsonHeaders=cookie=>({"content-type":"application/json",cookie});

  let response=await request("/api/health");assert.equal(response.status,200);
  response=await request("/api/products");assert.equal(response.status,401);

  const bootstrap=await login("admin","admin");assert.equal(bootstrap.response.status,200);assert.equal((await bootstrap.response.json()).mustChangePassword,true);
  response=await request("/api/products",{headers:{cookie:bootstrap.cookie}});assert.equal(response.status,403);
  response=await request("/api/auth/change-password",{method:"POST",headers:jsonHeaders(bootstrap.cookie),body:JSON.stringify({currentPassword:"admin",newPassword:"password8",confirmPassword:"password8"})});assert.equal(response.status,200);
  const adminCookie=response.headers.get("set-cookie").split(";")[0];

  response=await request("/api/products",{headers:{cookie:adminCookie}});let items=await response.json();assert.equal(items.length,0,"a fresh database must contain no inventory or sales");
  response=await request("/api/admin/users",{method:"POST",headers:jsonHeaders(adminCookie),body:JSON.stringify({username:"viewer",password:"viewer123",role:"readonly"})});assert.equal(response.status,201);
  const viewerLogin=await login("viewer","viewer123");
  response=await request("/api/auth/change-password",{method:"POST",headers:jsonHeaders(viewerLogin.cookie),body:JSON.stringify({currentPassword:"viewer123",newPassword:"viewer456",confirmPassword:"viewer456"})});
  const viewerCookie=response.headers.get("set-cookie").split(";")[0];
  response=await request("/api/products",{headers:{cookie:viewerCookie}});assert.equal(response.status,200);
  response=await request("/api/models",{headers:{cookie:viewerCookie}});assert.equal(response.status,200);assert.deepEqual((await response.json()).map(x=>x.name),["V3 Plus","V5 Pro","V6 Plus","V6 Pro"]);
  response=await request("/api/products",{method:"POST",headers:jsonHeaders(viewerCookie),body:"{}"});assert.equal(response.status,403);
  response=await request("/api/admin/users",{headers:{cookie:viewerCookie}});assert.equal(response.status,403);
  response=await request("/api/admin/models",{method:"POST",headers:jsonHeaders(viewerCookie),body:JSON.stringify({name:"Denied"})});assert.equal(response.status,403);

  response=await request("/api/admin/models",{method:"POST",headers:jsonHeaders(adminCookie),body:JSON.stringify({name:"V7 Ultra"})});assert.equal(response.status,201);const customModel=await response.json();
  response=await request("/api/admin/models",{method:"POST",headers:jsonHeaders(adminCookie),body:JSON.stringify({name:"v7 ultra"})});assert.equal(response.status,409,"model names are unique regardless of case");
  response=await request(`/api/admin/models/${customModel.id}`,{method:"PATCH",headers:jsonHeaders(adminCookie),body:JSON.stringify({name:"V7 Ultra Plus"})});assert.equal(response.status,200,"unused models may be renamed");
  response=await request("/api/products",{method:"POST",headers:jsonHeaders(adminCookie),body:JSON.stringify({uid:"U1",model:"v7 ultra plus",condition:"New",receivedAt:"2026-08-29"})});assert.equal(response.status,201);const item=await response.json();assert.equal(item.model,"V7 Ultra Plus","stored product uses the canonical catalog name");
  response=await request(`/api/admin/models/${customModel.id}`,{method:"PATCH",headers:jsonHeaders(adminCookie),body:JSON.stringify({active:false})});assert.equal(response.status,200);
  response=await request("/api/products",{method:"POST",headers:jsonHeaders(adminCookie),body:JSON.stringify({uid:"U2",model:"V7 Ultra Plus",condition:"New",receivedAt:"2026-08-29"})});assert.equal(response.status,400,"archived models cannot be newly received");
  response=await request(`/api/products/${item.id}/sell`,{method:"POST",headers:jsonHeaders(adminCookie),body:JSON.stringify({customerName:"Test Customer",soldAt:"2026-08-29",paymentMethod:"Venmo",paymentReference:"TX-123"})});const sale=await response.json();assert.equal(sale.status,"sold");assert.equal(sale.paymentMethod,"Venmo");assert.equal(sale.paymentReference,"TX-123");
  response=await request(`/api/admin/models/${customModel.id}`,{method:"DELETE",headers:{cookie:adminCookie}});assert.equal(response.status,400,"a historically used model cannot be deleted");
  response=await request(`/api/admin/models/${customModel.id}`,{method:"PATCH",headers:jsonHeaders(adminCookie),body:JSON.stringify({name:"Changed"})});assert.equal(response.status,400,"a historically used model cannot be renamed");
  response=await request(`/api/admin/models/${customModel.id}`,{method:"PATCH",headers:jsonHeaders(adminCookie),body:JSON.stringify({active:true})});assert.equal(response.status,200);
  response=await request("/api/admin/models",{headers:{cookie:adminCookie}});const catalog=await response.json(),usage=catalog.find(x=>x.id===customModel.id);assert.equal(usage.soldCount,1);assert.equal(usage.availableCount,0);
  response=await request(`/api/products/${item.id}/restock`,{method:"POST",headers:jsonHeaders(adminCookie),body:JSON.stringify({condition:"Used",receivedAt:"2026-08-29"})});assert.equal((await response.json()).status,"available");
  response=await request("/api/admin/models",{method:"POST",headers:jsonHeaders(adminCookie),body:JSON.stringify({name:"Temporary Model"})});const unused=await response.json();
  response=await request(`/api/admin/models/${unused.id}`,{method:"DELETE",headers:{cookie:adminCookie}});assert.equal(response.status,204,"unused models may be deleted");
});

test("legacy model constraint migrates without losing records", async t => {
  const data=await mkdtemp(join(tmpdir(),"vboxstock-legacy-")),databasePath=join(data,"vboxstock.db"),port=31992,legacy=new DatabaseSync(databasePath);
  legacy.exec("CREATE TABLE products (id TEXT PRIMARY KEY,uid TEXT NOT NULL DEFAULT '',sn TEXT NOT NULL DEFAULT '',mac TEXT NOT NULL DEFAULT '',manufacturer TEXT NOT NULL DEFAULT 'vSeeBox' CHECK(manufacturer='vSeeBox'),model TEXT NOT NULL CHECK(model IN ('V3 Plus','V6 Plus','V6 Pro','V5 Pro')),condition TEXT NOT NULL CHECK(condition IN ('New','Used','Refurbished')),received_at TEXT NOT NULL,cost REAL NOT NULL DEFAULT 0,notes TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','sold')),sold_at TEXT,customer_name TEXT,phone TEXT,sale_price REAL); INSERT INTO products (id,uid,model,condition,received_at) VALUES ('legacy-item','LEGACY-1','V3 Plus','New','2026-08-29')");legacy.close();
  const processHandle=spawn(process.execPath,["server.mjs"],{cwd:import.meta.dirname+"/..",env:{...process.env,DATA_DIR:data,PORT:String(port)}});t.after(()=>processHandle.kill());
  await new Promise((resolve,reject)=>{processHandle.stdout.on("data",chunk=>String(chunk).includes("listening")&&resolve());processHandle.stderr.on("data",chunk=>reject(new Error(String(chunk))));processHandle.on("error",reject)});
  const loginResponse=await fetch(`http://127.0.0.1:${port}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username:"admin",password:"admin"})}),cookie=loginResponse.headers.get("set-cookie").split(";")[0];
  let response=await fetch(`http://127.0.0.1:${port}/api/auth/change-password`,{method:"POST",headers:{"content-type":"application/json",cookie},body:JSON.stringify({currentPassword:"admin",newPassword:"password8",confirmPassword:"password8"})}),adminCookie=response.headers.get("set-cookie").split(";")[0];
  response=await fetch(`http://127.0.0.1:${port}/api/products`,{headers:{cookie:adminCookie}});const products=await response.json();assert.equal(products.length,1);assert.equal(products[0].uid,"LEGACY-1");
  response=await fetch(`http://127.0.0.1:${port}/api/models`,{headers:{cookie:adminCookie}});assert.ok((await response.json()).some(x=>x.name==="V3 Plus"));
  assert.ok((await readdir(join(data,"backups"))).some(name=>name.startsWith("pre-model-catalog-")),"migration creates a safety backup");
});
