import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

  response=await request("/api/products",{headers:{cookie:adminCookie}});let items=await response.json();assert.equal(items.length,10);
  response=await request("/api/admin/users",{method:"POST",headers:jsonHeaders(adminCookie),body:JSON.stringify({username:"viewer",password:"viewer123",role:"readonly"})});assert.equal(response.status,201);
  const viewerLogin=await login("viewer","viewer123");
  response=await request("/api/auth/change-password",{method:"POST",headers:jsonHeaders(viewerLogin.cookie),body:JSON.stringify({currentPassword:"viewer123",newPassword:"viewer456",confirmPassword:"viewer456"})});
  const viewerCookie=response.headers.get("set-cookie").split(";")[0];
  response=await request("/api/products",{headers:{cookie:viewerCookie}});assert.equal(response.status,200);
  response=await request("/api/products",{method:"POST",headers:jsonHeaders(viewerCookie),body:"{}"});assert.equal(response.status,403);
  response=await request("/api/admin/users",{headers:{cookie:viewerCookie}});assert.equal(response.status,403);

  response=await request("/api/products",{method:"POST",headers:jsonHeaders(adminCookie),body:JSON.stringify({uid:"U1",model:"V3 Plus",condition:"New",receivedAt:"2026-08-29"})});assert.equal(response.status,201);const item=await response.json();
  response=await request(`/api/products/${item.id}/sell`,{method:"POST",headers:jsonHeaders(adminCookie),body:JSON.stringify({customerName:"Test Customer",soldAt:"2026-08-29",paymentMethod:"Venmo",paymentReference:"TX-123"})});const sale=await response.json();assert.equal(sale.status,"sold");assert.equal(sale.paymentMethod,"Venmo");assert.equal(sale.paymentReference,"TX-123");
  response=await request(`/api/products/${item.id}/restock`,{method:"POST",headers:jsonHeaders(adminCookie),body:JSON.stringify({condition:"Used",receivedAt:"2026-08-29"})});assert.equal((await response.json()).status,"available");
});
