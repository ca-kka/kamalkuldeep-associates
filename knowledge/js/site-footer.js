(function(){
  const footer=document.createElement('footer');
  footer.className='main-site-footer';
  footer.innerHTML=`
    <div class="wrap main-footer-grid">
      <section class="main-footer-section">
        <h3>About Us</h3>
        <p><strong>Kamal Kuldeep &amp; Associates</strong></p>
        <p>ICAI Peer Reviewed Firm</p>
        <p class="footer-spaced">With over 23 years of professional excellence, we provide comprehensive auditing, taxation, and financial advisory services.</p>
      </section>
      <section class="main-footer-section">
        <h3>Quick Links</h3>
        <ul>
          <li><a href="../#home">Home</a></li>
          <li><a href="../#about">About Us</a></li>
          <li><a href="../#partners">Our Partners</a></li>
          <li><a href="../#services">Services</a></li>
          <li><a href="../#experience">Experience</a></li>
          <li><a href="../#due-dates">Due Dates</a></li>
          <li><a href="../#contact">Contact</a></li>
          <li><a href="../knowledge/">Knowledge Centre</a></li>
        </ul>
      </section>
      <section class="main-footer-section">
        <h3>Our Services</h3>
        <ul>
          <li>Statutory Audit</li><li>Bank Audits</li><li>Tax Audit</li><li>ITR Filing</li>
          <li>GST Filing &amp; Compliance</li><li>Business Registration</li><li>Regulatory &amp; Compliance Filing</li>
          <li>Stock &amp; Revenue Audit</li><li>Concurrent Audit</li><li>Due Diligence</li>
        </ul>
      </section>
      <section class="main-footer-section">
        <h3>Contact Us</h3>
        <p><strong>Head Office - Jalandhar</strong></p>
        <p> E.G. 1068, Mohalla Gobind Garh,<br>Jalandhar City, Punjab - 144001</p>
        <p class="footer-spaced"><strong>Branch Office - Ludhiana</strong></p>
        <p>53 Golf Link Extension, Hambran Road,<br>Ludhiana, Punjab - 141008</p>
        <p class="footer-spaced"><a href="tel:01812455917">0181-2455917</a><br><a href="tel:+919815681778">+91-98156-81778</a></p>
        <p><a href="mailto:kamal_ca72@rediffmail.com">kamal_ca72@rediffmail.com</a><br><a href="mailto:jain.hitesh95@gmail.com">jain.hitesh95@gmail.com</a></p>
      </section>
    </div>
    <div class="wrap main-footer-bottom">
      <p><strong>Kamal Kuldeep &amp; Associates</strong> - Chartered Accountants</p>
      <p>© 2025 All rights reserved. | ICAI Peer Reviewed Firm</p>
      <p>Last Updated: 14 August 2026</p>
      <div class="footer-social">
        <a href="https://wa.me/918289037976" target="_blank" rel="noopener" aria-label="WhatsApp">WhatsApp</a>
        <a href="mailto:kamal_ca72@rediffmail.com" aria-label="Email">Email</a>
        <a href="tel:+919815681778" aria-label="Phone">Phone</a>
      </div>
    </div>`;
  document.body.appendChild(footer);

  const wa=document.createElement('a');
  wa.className='kc-whatsapp-float';
  wa.href='https://wa.me/918289037976?text=Hello%2C%20I%20would%20like%20to%20inquire%20about%20your%20CA%20services.';
  wa.target='_blank'; wa.rel='noopener'; wa.setAttribute('aria-label','Chat with KKA on WhatsApp');
  wa.innerHTML='<span>WhatsApp</span>';
  document.body.appendChild(wa);
})();