// We need jQuery
var $ = window.jQuery;

// Import svg4everybody
import svg4everybody from 'svg4everybody';

// Import Cookies
import Cookies from 'js-cookie';

// Import stickyfill
var Stickyfill = require('stickyfill-web-module')();

export default {
  init() {
    // JavaScript to be fired on all pages

    //Iniitalize svg4everybody
    svg4everybody();

    // List for notication close
    $('#tofino-notification .close').on('click', function() {
      if (tofinoJS.cookieExpires) {
        Cookies.set('tofino-notification-closed', 'yes', {expires: parseInt(tofinoJS.cookieExpires)});
      } else {
        Cookies.set('tofino-notification-closed', 'yes');
      }
    });

    // Assign sticky
    var $sticky = document.getElementsByClassName('navbar-sticky-top');
    if($sticky.length) {
      Stickyfill.add($sticky[0]);
    }
  },
  finalize() {
    // JavaScript to be fired on all pages, after page specific JS is fired
  },
  loaded() {
    // Javascript to be fired on page once fully loaded
  }
};
