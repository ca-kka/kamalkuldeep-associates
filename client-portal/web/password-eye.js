const eyeButton=document.querySelector("#password-toggle");
if(eyeButton){
  eyeButton.classList.add("password-eye");
  const sync=()=>eyeButton.classList.toggle("is-visible",eyeButton.getAttribute("aria-pressed")==="true");
  sync();
  new MutationObserver(sync).observe(eyeButton,{attributes:true,attributeFilter:["aria-pressed"]});
}
