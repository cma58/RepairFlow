'use strict';
// Explicit server rights for dynamic membership contexts. Legacy PHIXAR
// manager permissions remain behind the existing role boundary until migrated.
const RIGHTS=Object.freeze({
 customers:'customers.write',repairs:'repairs.write',sales:'sales.write',discounts:'discounts.write',refunds:'refunds.approve',cash:'cash.close',inventory:'inventory.write',financial:'financial.read',employees:'employees.manage',exports:'exports.read',settings:'settings.manage'
});
const ALL=Object.freeze(Object.values(RIGHTS));
const BY_ROLE=Object.freeze({
 owner:ALL,
 manager:['customers.write','repairs.write','sales.write','discounts.write','cash.close','inventory.write','financial.read'],
 technician:['customers.write','repairs.write','inventory.write'],
 sales:['customers.write','sales.write']
});
const ACTION_RIGHT=Object.freeze({customer:RIGHTS.customers,repair:RIGHTS.repairs,changeRepair:RIGHTS.repairs,approveQuote:RIGHTS.repairs,repairCommand:RIGHTS.repairs,product:RIGHTS.inventory,stock:RIGHTS.inventory,refurb:RIGHTS.inventory,assess:RIGHTS.inventory,checkout:RIGHTS.sales,closeDay:RIGHTS.cash,correction:RIGHTS.settings});
function deny(){const e=Error('ACCESS_DENIED');e.code='ACCESS_DENIED';throw e}
function requirePermission(staff,req){
 if(!staff.dynamic)return;
 // The existing GET response includes finance, customer and stock fields.
 const right=req.method==='GET'?RIGHTS.financial:ACTION_RIGHT[req.body?.action];
 if(!right||staff.rights?.[right]==='deny'||staff.rights?.[right]!=='allow'&&!BY_ROLE[staff.role]?.includes(right))deny();
}
module.exports={RIGHTS,BY_ROLE,ACTION_RIGHT,requirePermission};
