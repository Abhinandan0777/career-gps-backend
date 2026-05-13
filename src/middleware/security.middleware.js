import helmet from 'helmet';

/**
 * Configure security headers using helmet.js
 * Sets CSP, X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, HSTS
 * @returns {Function} Express middleware function
 */
export function securityHeaders() {
  return helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    // X-Content-Type-Options: nosniff
    // Prevents browsers from MIME-sniffing a response away from the declared content-type
    xContentTypeOptions: true,
    
    // X-Frame-Options: DENY
    // Prevents clickjacking attacks by not allowing the page to be embedded in frames
    frameguard: {
      action: 'deny'
    },
    
    // X-XSS-Protection: 1; mode=block
    // Enables XSS filter built into most browsers
    xssFilter: true,
    
    // Strict-Transport-Security
    // Forces HTTPS connections
    hsts: {
      maxAge: 31536000, // 1 year in seconds
      includeSubDomains: true,
      preload: true
    },
    
    // X-DNS-Prefetch-Control: off
    // Controls browser DNS prefetching
    dnsPrefetchControl: {
      allow: false
    },
    
    // Referrer-Policy: no-referrer
    // Controls how much referrer information should be included with requests
    referrerPolicy: {
      policy: 'no-referrer'
    },
    
    // X-Permitted-Cross-Domain-Policies: none
    // Restricts Adobe Flash and PDF cross-domain requests
    permittedCrossDomainPolicies: {
      permittedPolicies: 'none'
    }
  });
}
