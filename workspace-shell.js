'use strict';
// Reuse the shop navigation while every operational form stays bound to /api/workspace.
// The legacy browser store is deliberately never read or mutated here.
(()=>{
 const main=document.querySelector('main');
 if(!main||document.querySelector('.shop-nav'))return;
 const modules=[
  ['customers','Klanten'],['repairs','Reparaties'],['stock','Onderdelen / voorraad'],
  ['refurbished','Refurbished'],['checkout','Kassa en verkoopbewijzen'],['cash-days','Kassadag']
 ];
 const sections=[...main.querySelectorAll(':scope > section')];
 if(sections.length!==modules.length)return;
 const app=document.createElement('div');app.className='shop-app';
 const side=document.createElement('aside');side.className='shop-nav';
 const brand=document.createElement('div');brand.className='shop-brand';brand.textContent='PHIXAR · ERP';
 const nav=document.createElement('nav');nav.setAttribute('aria-label','Winkelmodules');
 modules.forEach(([id,title],index)=>{
  sections[index].id='module-'+id;
  const button=document.createElement('button');button.type='button';button.textContent=title;
  button.dataset.module=id;button.setAttribute('aria-controls',sections[index].id);
  button.addEventListener('click',()=>show(index));nav.append(button);
 });
 side.append(brand,nav);
 main.parentNode.insertBefore(app,main);app.append(side,main);
 function show(index){
  sections.forEach((section,i)=>section.hidden=i!==index);
  [...nav.children].forEach((button,i)=>{
   button.classList.toggle('active',i===index);
   if(i===index)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
  main.querySelector('h1').textContent='PHIXAR · '+modules[index][1];
 }
 show(0);
})();
