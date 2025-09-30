// ==UserScript==
// @name         Get Grocery Shopping History
// @namespace    PrettyDarnUseful
// @version      0.6
// @description  Get Grocery Shopping History
// @author       ThermoMan
// @match        https://www.(dillons|kroger).com/mypurchases/detail/*
// @run-at       document-end
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js
// ==/UserScript==

/**
 ** TO DO LIST
 **
 ** File Format
 **   Instead of building a giant text field build a JSON object
 **     Add a checkbox to save as CSV or JSON?
 **   Excel is not recognizing the first column in the CSV file as a date, it thinks that it is text.
 **
 ** Data Source
 **   Test delivery and get that to work.
 **   Either duplicate this script for Walmart or add a detection mode.  Filename and a data column should also indicate the difference
 **
 ** Parsed Data
 **   Perhaps add the mode to the CSV file?  'in store', 'pickup', 'delivery', 'fuel station'
 **   Add store name in case someone shops at both Kroger and Dillons.
 **   Perhaps add store address (or store #) to differentiate in case a product is only at one store, but not the other.
 **
 ** Inner Smarts
 **   Should I do something when the price shown in the QUANTITY column does not match the EXTENDED PRICE (for instance note the discount or the tax?)
 **     Fuel price actually has a message about discount in hidden text.
 **   Move the character translate into a list and just iterate through the list
 **
 ** Test Cases before commit
 **   Normal in store purchase
 **   Online order with pickup
 **   Fuel Station
 **/

/**
 ** My reference notes
 **
 ** Fix Firefox warning of slow scripts https://support.mozilla.org/en-US/kb/warning-unresponsive-script
 **
 ** GreaseMonkey wiki https://wiki.greasespot.net/Main_Page
 ** GreaseMonkey docs http://greasemonkey.win-start.de/
 **
 **/

(function(){
  'use strict';
  var debug = false;

  // Log function for debugging
  function log( pMessage ){
    if( debug ){
      if( pMessage === 'clear' ){
        console.clear();
      }
      else{
        console.debug( pMessage );
      }
    }
  }


  function buttonClickAction(){
    log( 'buttonClickAction started' );

    // Show spinning notifier
    $( '#rs_grocery_button' ).prop( 'disabled', true ).addClass( 'disabled' );
    $( '#rs_grocery_button .glyph-spinner' ).css( 'visibility', 'visible' ).addClass( 'spinning' );

    try {
      // Get trip date from URL (note that tripDate is a STRING not a Date object)
      var tripDate = window.location.href.split('~')[2];
      log( 'Date of purchase was: ' + tripDate );
      var storeName = window.location.href.split('.')[1];

      var product;
      var productName;
      var productData1;
      var productData2;
      var productSize;
      var productUnits;
      var productCount;
      var extendedPrice;
      var quantity;
      var unitPrice;
      var message;
      var ii = 0;
      var saveString = "STORE,DATE,MESSAGE,NAME,SIZE,UNITS,COUNT,UNIT_PRICE,QTY,EXT_PRICE\n";
      $( 'div[class="PH-ProductCard-container w-full p-16"]' ).each( function(){
//		    log( 'buttonClickAction looping: ' + ii );
        product = '';
        productName = '';
        productData1 = '';
        productData2 = '';
        productSize = '';
        productUnits = '';
        productCount = '';
        extendedPrice = '';
        quantity = '';
        unitPrice = '';
        var message = $( this )[0].childNodes[0].childNodes[0].innerText;
        if( 'Out-of-Stock' === message ){
          product = $( this )[0].childNodes[1].childNodes[1].childNodes[0].childNodes[0];
          productName = product.childNodes[0].childNodes[0].innerText;
//log( 'productName (' + productName + ')' )
          productData1 = '';
          productData2 = '';
          extendedPrice = 0;
          quantity = 0;
          unitPrice = 0;
        }
        else if( 'Substitution' === message  ){
debugger;
//          product = $( this )[0].childNodes[1].childNodes[1].childNodes[0].childNodes[0];
          product = $( this )[0].childNodes[2].childNodes[0].childNodes[1].childNodes[0];
//          productName = product.childNodes[0].childNodes[0].innerText;
          productName = product.childNodes[0].childNodes[0].innerText;
          productData1 = product.childNodes[1].innerText;
          productData2 = $( this ).find( 'span[class="kds-Text--s text-default-500 body-xs"]' ).text();
        }
        else if( 'FUEL' === message  ){
debugger;
          product = $( this )[0].childNodes[0].childNodes[1].childNodes[0];
          productName = product.childNodes[0].childNodes[0].innerText;
          productData1 = '';
          productData2 = product.childNodes[1].childNodes[1].innerText;
        }
        else{
          message = 'Purchase';
          product = $( this )[0].childNodes[2].childNodes[0].childNodes[1].childNodes[0];

//        productName is something like "Ben's Original Enriched Long Grain White Rice, Parboiled Rice, 5 lb Bag"
          productName = product.childNodes[0].childNodes[0].innerText;


//        productData1 is something like "5 lb" or "4 ct / 10.5 oz" or sometimes the evil "net wt 38 oz" or "bag / 3 lb"
          if( 'SNAP EBT' === product.childNodes[0].childNodes[1].innerText ){
	          productData1 = product.childNodes[0].childNodes[2].innerText;
          }
          else{
	          productData1 = product.childNodes[0].childNodes[1].innerText;
          }
          productData1 = productData1.replace(/net wt /g,'').replace(/bag \/ /g,'');  // Remove evil leading text
          log( 'productData1 ' + productData1 );

          
//        productData2 is something like "1 x $10.99/each" - under the large text decorated extended price
          productData2 = product.childNodes[1].childNodes[1].innerText;
        }
        // Parse productData1 to get count, size, and units.
        if( productData1.indexOf( '/' ) > -1 ){
          var productParts = productData1.split( ' / ' );
          var p1 = productParts[0];
          var pCC = p1.split( ' ' );
          productCount = pCC[0];
          var p2 = productParts[1];
          var pSU = p2.split( ' ' );
          productSize = pSU[0];
          productUnits = pSU[1];
        }
        else if( message !== 'FUEL' ){
          var productParts = productData1.split( / (.+)/ );
          productCount = 1;
          productSize = productParts[0];
          productUnits = productParts[1];
        }

        // Parse quantity
        var productParts = productData2.split( ' x ' );
        var p1 = productParts[0];
        if( p1.indexOf( ' ' ) > -1 ){
          var pSU = p1.split( ' ' );
          productCount = 1;
          productSize = pSU[0];
          productUnits = pSU[1];
          quantity = 1;
        }
        else{
          quantity = p1;
        }
        if( 'FUEL' === message  ){
          var p2 = productParts[1];
          var pPU = p2.split( '/' );
          unitPrice = pPU[0];
          quantity = 1;
        }
        else{
          unitPrice = productParts[1].split('/')[0];
        }
        extendedPrice = quantity * unitPrice.split('$')[1];

        saveString = saveString + storeName + "," + tripDate + "," + message + "," + productName.replace(/,/g,'') + "," + productSize + "," + productUnits + "," + productCount + "," + unitPrice + "," + quantity + "," + extendedPrice + "\n";

        ii++;
      });
      save( saveString, tripDate );
    }
    catch( error ){
      log( 'Error in buttonClickAction: ' + error );
      log( 'Last productName was ' + productName );
      alert( 'Error message here - tell user there is no file ouput.' );
    }
    finally{
      // Hide spinning notifier and re-enable button
      $( '#rs_grocery_button .glyph-spinner' ).css( 'visibility', 'hidden' ).removeClass( 'spinning' );
      $( '#rs_grocery_button' ).prop( 'disabled', false ).removeClass( 'disabled' );
    }
  }


  function addToggleButton(){
    log( 'addToggleButton started' );

    var $button = $( '<button>', {
      id: 'rs_grocery_button',
      html: '<span class="glyph-spinner" style="margin-right: 10px; visibility: hidden; font-size: 16px; display: inline-block;">&#10043;</span> Get Grocery List',
      css: {
        position: 'fixed',
        top: '200px',
        right: '100px',
        zIndex: 9999,
        padding: '12px 20px',
        background: 'linear-gradient(135deg, #4CAF50, #2E7D32)',
        color: '#FFFFFF',
        border: 'none',
        cursor: 'pointer',
        borderRadius: '8px',
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
        font: '13px "Open Sans", Arial, sans-serif',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '1.2px',
        transition: 'all 0.2s ease'
      }
    }).appendTo( 'body' );

    // Inject spinner CSS
    var css = `
      .glyph-spinner.spinning {
        animation: spin 1s linear infinite;
        display: inline-block;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      @-webkit-keyframes spin {
        0% { -webkit-transform: rotate(0deg); }
        100% { -webkit-transform: rotate(360deg); }
      }
      @-moz-keyframes spin {
        0% { -moz-transform: rotate(0deg); }
        100% { -moz-transform: rotate(360deg); }
      }
    `;
    $( '<style>' ).text( css ).appendTo( 'head' );
    log( 'Spinner CSS injected' );

    $button.on( 'mouseenter', function(){
      if( ! $button.hasClass( 'disabled' ) ){
        $button.css({
          boxShadow: '0 6px 12px rgba(0, 0, 0, 0.4), 0 0 10px rgba(76, 175, 80, 0.7)',
          transform: 'translateY(-2px)'
        });
      }
    });

    $button.on( 'mouseleave', function(){
      $button.css({
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
        transform: 'translateY(0)'
      });
    });

    $button.on( 'click', function(){
      if( ! $button.hasClass( 'disabled' ) ){
        log( 'Button clicked' );
        $button
          .animate({ transform: 'scale(0.95)' }, 100 )
          .animate({ transform: 'scale(1)' }, 100 );
        buttonClickAction();
      }
    });

    return $button[0];
  }


  function save( pMessage, pDate ){
    log( save );

    // Convert bad characters to normal ones or remove them entirely.
    pMessage = pMessage.replaceAll( '®', '' );
    pMessage = pMessage.replaceAll( '™', '' );
    pMessage = pMessage.replaceAll( '’', "'" );

    var anchor = document.createElement( 'a' );
    anchor.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent( pMessage );
    anchor.download = "Grocery Export " + pDate + ".csv";		// Note that pDate is a STRING not a Date object.
    document.body.appendChild( anchor );
    anchor.click();
    document.body.removeChild( anchor );
  }


  function triggerThings(){
    log( 'triggerThings' );
    const button = addToggleButton();
	  addToggleButton();
  }

  window.setTimeout( triggerThings, 500 );
})();
