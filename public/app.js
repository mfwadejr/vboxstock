const $ = (s) => document.querySelector(s);
const state = { products: [], tab: "available", query: "", page: 1 };
const PAGE_SIZE = 10;
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (v) => v ? new Date(`${v}T12:00:00`).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";
const fmtDateTime = (v) => v ? new Date(`${v.replace(" ","T")}Z`).toLocaleString("en-US", { year:"numeric", month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }) : "—";
const esc = (v = "") => String(v).replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[c]);
const ids = p => [["UID",p.uid],["SN",p.sn],["MAC",p.mac]].filter(([,v]) => v);
const primaryId = p => ids(p)[0]?.[1] || "No identifier";

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "content-type":"application/json" }, ...options });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function toast(message) { const el=$("#toast"); el.textContent=message; el.hidden=false; clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.hidden=true,2600); }
function openModal(html) { $("#modalBody").innerHTML=html; $("#modal").showModal(); }
function closeModal() { $("#modal").close(); }
function address(p) { return [p.shipAddress1,p.shipAddress2,[p.shipCity,p.shipState].filter(Boolean).join(", "),p.shipZip].filter(Boolean).join(" · "); }
function idCell(p) { return ids(p).length ? ids(p).map(([k,v])=>`<code>${k}: ${esc(v)}</code>`).join("") : "<small>Not entered</small>"; }
function customers() {
  const grouped=new Map();
  state.products.filter(p=>p.status==="sold"&&p.customerName).forEach(p=>{
    const key=p.customerId||p.customerName.toLowerCase(), current=grouped.get(key)||{key,name:p.customerName,phone:p.phone,customerId:p.customerId,purchases:[],representative:p};
    current.purchases.push(p); if((p.soldAt||"")>(current.representative.soldAt||"")) current.representative=p; grouped.set(key,current);
  });
  return [...grouped.values()].map(c=>({...c,count:c.purchases.length,total:c.purchases.reduce((n,p)=>n+Number(p.salePrice||0),0),lastPurchase:c.representative.soldAt})).sort((a,b)=>(b.lastPurchase||"").localeCompare(a.lastPurchase||""));
}

function filtered() {
  const q=state.query.toLowerCase().trim();
  if(state.tab==="customers") return customers().filter(c=>!q||[c.name,c.phone].some(v=>String(v||"").toLowerCase().includes(q))||c.purchases.some(p=>Object.values(p).some(v=>String(v??"").toLowerCase().includes(q))));
  const status=state.tab==="available"?"available":"sold";
  return state.products.filter(p=>p.status===status && (!q || Object.values(p).some(v=>String(v??"").toLowerCase().includes(q))));
}
function render() {
  const available=state.products.filter(p=>p.status==="available"), sold=state.products.filter(p=>p.status==="sold"), month=today().slice(0,7), monthSales=sold.filter(p=>p.soldAt?.startsWith(month));
  $("#availableCount").textContent=available.length; $("#soldCount").textContent=monthSales.length;
  $("#value").textContent=money.format(available.reduce((n,p)=>n+Number(p.cost||0),0));
  $("#revenue").textContent=monthSales.length?`${money.format(monthSales.reduce((n,p)=>n+Number(p.salePrice||0),0))} in sales`:"No sales recorded";
  $("#availableBadge").textContent=available.length; $("#soldBadge").textContent=sold.length; $("#customerBadge").textContent=customers().length;
  document.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===state.tab));
  const all=filtered(), pages=Math.max(1,Math.ceil(all.length/PAGE_SIZE)); state.page=Math.min(state.page,pages);
  const start=(state.page-1)*PAGE_SIZE, rows=all.slice(start,start+PAGE_SIZE);
  $("#thead").innerHTML=state.tab==="available"?"<tr><th>Product</th><th>UID / SN / MAC</th><th>Received</th><th>Cost</th><th>Status</th><th></th></tr>":state.tab==="customers"?"<tr><th>Customer</th><th>Phone</th><th>Purchases</th><th>Last purchase</th><th>Total spent</th><th></th></tr>":"<tr><th>Product</th><th>Customer</th><th>UID / SN / MAC</th><th>Sold</th><th>Payment</th><th>Sale price</th><th></th></tr>";
  $("#rows").innerHTML=rows.map(p=>state.tab==="available"?inventoryRow(p):state.tab==="customers"?customerRow(p):saleRow(p)).join("");
  $("#empty").hidden=Boolean(rows.length); $("#empty").textContent=state.query?"No records match your search.":state.tab==="available"?"No products are available.":state.tab==="customers"?"Customer records will appear after the first sale.":"No sales have been recorded.";
  $("#pagination").innerHTML=all.length?`<span>Showing ${start+1}–${Math.min(start+PAGE_SIZE,all.length)} of ${all.length}</span><div><button data-page="prev" ${state.page===1?"disabled":""}>Previous</button><strong>Page ${state.page} of ${pages}</strong><button data-page="next" ${state.page===pages?"disabled":""}>Next</button></div>`:"";
}
function inventoryRow(p) { return `<tr><td class="product"><strong>${esc(p.model)}</strong><small>${esc(p.manufacturer)} · ${esc(p.condition)}</small></td><td><div class="ids">${idCell(p)}</div></td><td>${fmtDate(p.receivedAt)}</td><td>${p.cost?money.format(p.cost):"—"}</td><td><span class="pill">Available</span></td><td><div class="row-actions"><button data-sell="${p.id}">Sell</button><button class="danger" data-delete="${p.id}">Delete</button></div></td></tr>`; }
function saleRow(p) { return `<tr><td class="product"><strong>${esc(p.model)}</strong><small>${esc(p.manufacturer)} · ${esc(p.condition)}</small></td><td class="customer"><button class="customer-link" data-customer="${p.customerId||""}" data-id="${p.id}">${esc(p.customerName||"Unknown")}</button>${p.phone?`<small>${esc(p.phone)}</small>`:""}</td><td><div class="ids">${idCell(p)}</div></td><td>${fmtDate(p.soldAt)}</td><td>${esc(p.paymentMethod||"—")}${p.paymentReference?`<small>${esc(p.paymentReference)}</small>`:""}</td><td>${p.salePrice?money.format(p.salePrice):"—"}</td><td><div class="row-actions"><button data-view="${p.id}">View</button><button data-restock="${p.id}">Void & restock</button><button class="danger" data-delete="${p.id}">Delete</button></div></td></tr>`; }
function customerRow(c) { return `<tr><td class="customer"><strong>${esc(c.name)}</strong></td><td>${esc(c.phone||"—")}</td><td>${c.count}</td><td>${fmtDate(c.lastPurchase)}</td><td>${c.total?money.format(c.total):"—"}</td><td><button class="customer-link" data-customer="${c.customerId||""}" data-id="${c.representative.id}">View customer</button></td></tr>`; }

function receiveForm() {
  openModal(`<h2>Receive product</h2><p>Add a vSeeBox unit to available inventory.</p><form id="receiveForm"><div class="scan"><label>UID<input name="uid" autofocus></label><label>Serial number<input name="sn"></label><label>MAC address<input name="mac"></label></div><div class="form-row"><label>Model<select name="model"><option>V3 Plus</option><option>V6 Plus</option><option>V6 Pro</option><option>V5 Pro</option></select></label><label>Condition<select name="condition"><option>New</option><option>Used</option><option>Refurbished</option></select></label></div><div class="form-row"><label>Received date<input name="receivedAt" type="date" value="${today()}" required></label><label>Purchase cost<input name="cost" type="number" min="0" step=".01"></label></div><label>Notes<textarea name="notes" rows="2"></textarea></label><div class="form-actions"><button type="button" class="secondary" data-cancel>Cancel</button><button class="primary">Receive product</button></div></form>`);
  $("#receiveForm").onsubmit=e=>submitForm(e,"/api/products","Product received."); $("[data-cancel]").onclick=closeModal;
}
function sellForm(id="") {
  const available=state.products.filter(p=>p.status==="available");
  openModal(`<h2>Record a sale</h2><p>Enter the customer, payment, and shipped-to details.</p><form id="sellForm"><label>Product<select name="productId" required>${available.map(p=>`<option value="${p.id}" ${p.id===id?"selected":""}>${esc(p.model)} — ${esc(primaryId(p))}</option>`).join("")}</select></label><div class="form-row"><label>Customer name<input name="customerName" required></label><label>Cell phone<input name="phone" type="tel"></label></div><div class="form-row"><label>Payment method<select name="paymentMethod" required><option value="">Choose a method</option><option>Cash</option><option>Venmo</option><option>PayPal</option></select></label><label>Payment reference (optional)<input name="paymentReference" placeholder="Transaction ID or note"></label></div><h3>Shipped to</h3><label>Street address<input name="shipAddress1" autocomplete="shipping address-line1"></label><label>Apartment, suite, or unit<input name="shipAddress2" autocomplete="shipping address-line2"></label><div class="address-grid"><label>City<input name="shipCity" autocomplete="shipping address-level2"></label><label>State<input name="shipState" autocomplete="shipping address-level1"></label><label>ZIP code<input name="shipZip" autocomplete="shipping postal-code"></label></div><label>Shipping notes<textarea name="shippingNotes" rows="2"></textarea></label><div class="form-row"><label>Sale price<input name="salePrice" type="number" min="0" step=".01"></label><label>Date sold<input name="soldAt" type="date" value="${today()}" required></label></div><label>Transaction notes (optional)<textarea name="saleNotes" rows="3" placeholder="Example: Met at Wawa for exchange"></textarea></label><div class="form-actions"><button type="button" class="secondary" data-cancel>Cancel</button><button class="primary">Complete sale</button></div></form>`);
  $("#sellForm").onsubmit=async e=>{ e.preventDefault(); const data=Object.fromEntries(new FormData(e.currentTarget)), productId=data.productId; delete data.productId; await change(`/api/products/${encodeURIComponent(productId)}/sell`,"POST",data,"Sale recorded."); }; $("[data-cancel]").onclick=closeModal;
}
async function submitForm(e,path,message,method="POST"){ e.preventDefault(); await change(path,method,Object.fromEntries(new FormData(e.currentTarget)),message); }
async function change(path,method,body,message){ try{ await api(path,{method,body:body?JSON.stringify(body):undefined}); closeModal(); await load(); toast(message); }catch(e){ toast(e.message); } }

function viewSale(p) {
  openModal(`<h2>Sale record</h2><p>${esc(p.model)} · ${fmtDate(p.soldAt)}</p><section class="detail-card"><h3>Customer</h3><p><strong>${esc(p.customerName||"Unknown")}</strong></p><p>${esc(p.phone||"No phone recorded")}</p></section><section class="detail-card"><h3>Payment</h3><p><strong>${esc(p.paymentMethod||"Not recorded")}</strong></p>${p.paymentReference?`<p>Reference: ${esc(p.paymentReference)}</p>`:""}</section><section class="detail-card"><h3>Shipped to</h3><p>${address(p)?esc(address(p)):"No shipping address recorded"}</p>${p.shippingNotes?`<p><small>${esc(p.shippingNotes)}</small></p>`:""}</section><section class="detail-card"><h3>Product and sale</h3><p>${esc(p.manufacturer)} ${esc(p.model)} · ${esc(p.condition)}</p><div class="ids">${idCell(p)}</div><p>Received: ${fmtDate(p.receivedAt)} · Sold: ${fmtDate(p.soldAt)}</p><p>Cost: ${p.cost?money.format(p.cost):"—"} · Sale price: ${p.salePrice?money.format(p.salePrice):"—"}</p>${p.notes?`<p>Inventory notes: ${esc(p.notes)}</p>`:""}</section><form id="transactionNotesForm"><label>Transaction notes<textarea name="saleNotes" rows="4" placeholder="Delivery, pickup, exchange, or other sale details">${esc(p.saleNotes||"")}</textarea></label><div class="form-actions"><button type="button" class="secondary" data-cancel>Close</button><button class="primary">Save notes</button></div></form>`); $("[data-cancel]").onclick=closeModal; $("#transactionNotesForm").onsubmit=e=>submitForm(e,`/api/products/${encodeURIComponent(p.id)}`,"Transaction notes saved.","PATCH");
}
async function viewCustomer(p) {
  if(!p.customerId) return viewSale(p);
  try { const c=await api(`/api/customers/${encodeURIComponent(p.customerId)}`), addr=[c.address1,c.address2,[c.city,c.state].filter(Boolean).join(", "),c.zip].filter(Boolean).join(" · ");
    openModal(`<h2>${esc(c.name)}</h2><p>Customer record, support notes, and purchase history.</p><section class="detail-card"><p>${esc(c.phone||"No phone recorded")}</p><p>${addr?esc(addr):"No shipping address recorded"}</p>${c.shippingNotes?`<p><small>${esc(c.shippingNotes)}</small></p>`:""}</section><section class="customer-notes"><h3>Customer notes</h3><form id="customerNoteForm"><div class="form-row"><label>Category<select name="category"><option>General</option><option>Support</option><option>Follow-up</option></select></label><label>New note<textarea name="note" rows="3" required placeholder="Issue, support contact, or follow-up"></textarea></label></div><div class="form-actions"><button class="primary">Add note</button></div></form>${c.notes.length?c.notes.map(n=>`<article><div><span class="note-category">${esc(n.category)}</span><small>${fmtDateTime(n.createdAt)}</small></div><p>${esc(n.note)}</p><button class="danger" data-delete-note="${n.id}">Delete</button></article>`).join(""):"<p class=\"muted\">No customer notes yet.</p>"}</section><section class="customer-purchases"><h3>Purchases (${c.purchases.length})</h3>${c.purchases.map(s=>`<article><strong>${esc(s.model)}</strong> · ${esc(primaryId(s))}<p>${fmtDate(s.soldAt)} · ${s.salePrice?money.format(s.salePrice):"Price not recorded"}</p><button data-customer-sale="${s.id}">View sale</button></article>`).join("")}</section><div class="form-actions"><button class="primary" data-cancel>Close</button></div>`);
    $("[data-cancel]").onclick=closeModal; document.querySelectorAll("[data-customer-sale]").forEach(b=>b.onclick=()=>viewSale(c.purchases.find(s=>s.id===b.dataset.customerSale)));
    $("#customerNoteForm").onsubmit=async e=>{e.preventDefault();try{await api(`/api/customers/${encodeURIComponent(c.id)}/notes`,{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});await viewCustomer(p);toast("Customer note added.");}catch(error){toast(error.message);}};
    document.querySelectorAll("[data-delete-note]").forEach(b=>b.onclick=async()=>{if(!confirm("Delete this customer note?"))return;try{await api(`/api/customers/${encodeURIComponent(c.id)}/notes/${encodeURIComponent(b.dataset.deleteNote)}`,{method:"DELETE"});await viewCustomer(p);toast("Customer note deleted.");}catch(error){toast(error.message);}});
  } catch(e){ toast(e.message); }
}
function restockForm(p){ openModal(`<h2>Void sale & restock</h2><p>Return ${esc(p.model)} to inventory.</p><form id="restockForm"><label>Condition<select name="condition"><option>Used</option><option>Refurbished</option><option>New</option></select></label><label>Return date<input name="receivedAt" type="date" value="${today()}" required></label><div class="form-actions"><button type="button" class="secondary" data-cancel>Cancel</button><button class="primary">Restock product</button></div></form>`); $("[data-cancel]").onclick=closeModal; $("#restockForm").onsubmit=e=>submitForm(e,`/api/products/${encodeURIComponent(p.id)}/restock`,"Product restocked."); }

async function load(){ state.products=await api("/api/products"); render(); }
document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;state.page=1;render();});
$("#search").oninput=e=>{state.query=e.target.value;state.page=1;render();};
$("[data-open=receive]").onclick=receiveForm; $("[data-open=sell]").onclick=()=>sellForm();
$("#pagination").onclick=e=>{if(!e.target.dataset.page)return;state.page+=e.target.dataset.page==="next"?1:-1;render();};
$("#rows").onclick=async e=>{const b=e.target.closest("button");if(!b)return;const id=b.dataset.sell||b.dataset.view||b.dataset.restock||b.dataset.delete||b.dataset.id,p=state.products.find(x=>x.id===id);if(!p)return;if(b.dataset.sell)sellForm(id);else if(b.dataset.view)viewSale(p);else if(b.dataset.customer!==undefined)viewCustomer(p);else if(b.dataset.restock)restockForm(p);else if(b.dataset.delete&&confirm(`Permanently delete this ${p.status==="sold"?"sale":"product"} record?`))await change(`/api/products/${encodeURIComponent(id)}`,"DELETE",null,"Record deleted.");};
$("#modal .close").onclick=closeModal; $("#modal").onclick=e=>{if(e.target===$("#modal"))closeModal();};
$("#date").textContent=new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
load().catch(e=>toast(e.message));
