/* Copyright (c) 2017-present, salesforce.com, inc. All rights reserved */
/* Licensed under BSD 3-Clause - see LICENSE.txt or git.io/sfdc-license */

'use strict';

var utils = require('violet/lib/utils');
var violet = require('violet').script({invocationName:'quip bot'});
var violetTime = require('violet/lib/violetTime')(violet);
var itemList = require('violet/lib/violetList-api')(violet, 'Items', 'item', 'items', 'text');
var categoryList = require('violet/lib/violetList-api')(violet, 'Categories', 'category', 'categories', 'text');

var quipSvc = require('./svc.js');
var Promise = require('bluebird');

module.exports = violet;

violet.addPhraseEquivalents([
  ["my to do", "my list", "my to do list"],
]);

violet.addInputTypes({
  "itemNo": "number",
  "categoryNo": "number",
  'itemName': "phrase"
});

// // want to support this script in many forms
// u: Violet, add an item to the Acme Company EBC document
// v: Found the Acme Company EBC document. Which section would you like to update - Financials, EBC Agenda or ToDo?
// u: To Do
// v: Got it. What would you like to add to the checklist in the section ToDo?
// u: Make dinner reservations
// v: Got it. I added the item “make dinner reservations” to the checklist. Anything else?
// u: No thank you

/*
 * Assumptions:
 *  a) One hardcoded document
 *  b) One hardcoded list
 */

var makePretty=(str)=>{
  if (!str) return 'Error in Input';
 str = str.trim();
 return str.charAt(0).toUpperCase() + str.slice(1); // first letter uppercase
};

var ack = (response) => { response.say(['Got it.', 'Great.', 'Awesome']); }
var err = (response) => { response.say(['Sorry', 'Whoops']); }
var retry = (response) => { response.say(['Please try again', 'Would you mind repeating']); }
var apologize = (response, msg) => {
  err(response);
  response.say(msg);
  retry(response);
}

// ToDo - make the below configurable
var tgtDocId = process.env.QUIP_TGT_DOC_ID;
var tgtDoc = 'Acme Company EBC'
var tgtSec = 'To Do'

var appendToCategory = (category, itemName) => {
  console.log('appendToCategory - category', category);
  var lastList = category.children;
  quipSvc.appendItemsWithinSection(tgtDocId, lastList[lastList.length-1].id, [makePretty(itemName)]);
}

// define the cateogry list interactions
violet.defineGoal({
  goal: categoryList.interactionGoal(),
  prompt: [`Would you like to use one of these categories`],
  respondTo: [{
    expecting: [`use category [[categoryNo]]`],
    resolve: (response) => {
      var category = categoryList.getItemFromResults(response, response.get('categoryNo'));
      var itemName = response.get('itemName');
      response.say(`Got it. I added ${itemName} to the checklist. Anything else?`);
      appendToCategory(category, response.get('itemName'));
  }}, {
    expecting: ['go back'],
    resolve: function (response) {
      ack(response);
  }}]
});


violet.respondTo(['add [[itemName]] to the list'],
  (response) => {
    var itemName = response.get('itemName');
    if (!itemName)
      return apologize(response, 'I could not understand what you asked to be added.');
    return quipSvc
      .getItemsP(tgtDocId, /*asList*/false)
      .then(categorizedItems=>{
        if (categorizedItems.length==0) {
          response.say(`Got it. I added [[itemName]] to the document. Anything else?`);
          quipSvc.appendItemsWithinSection(tgtDocId, tgtDocId, [makePretty(itemName)]);
          return;
        } else if (categorizedItems.length==1) {
          response.say(`Got it. I added [[itemName]] to the checklist. Anything else?`);
          appendToCategory(categorizedItems[0], itemName);
          return;
        } else { // categorizedItems.length > 1
          response.say('Sure.');
          console.log('categorizedItems', categorizedItems);
          response.set('Categories', categorizedItems);
          categoryList.respondWithItems(response, categorizedItems);
        }
      });
});

violet.respondTo(['whats next to be done', 'whats next on my to do'],
  (response) => {
    return quipSvc.getItemsP(tgtDocId, /*asList*/true).then((items)=>{
      items = flagItemsAsDone(items);
      var nxtItem = items.children.find(i=>{return (i.done==false);});
      if (!nxtItem) {
        response.say(`There are no items that need to be done on your list`);
        return;
      }
      response.set('tgtItem', nxtItem);
      response.say(`The next item is ${nxtItem.text}`);
    });
});

var markItemChecked = (docId, itemId, itemHtml) => {
  // waiting on Quip team to implement this correctly
  return quipSvc.modifyListItem(docId, itemId, [`<del>${itemHtml}</del>`]);
};
var flagItemsAsDone = (items) => {
  // waiting on Quip team to implement this correctly
  items.children = items.children.map(i=>{
    if (i.html.startsWith('<del>')) i.done = true;
    return i;
  });
  return items;
};


// define the item list interactions
violet.defineGoal({
  goal: itemList.interactionGoal(),
  prompt: [`Would you like to mark an item as done`],
  respondTo: [{
    expecting: [`mark item [[itemNo]] as {done|checked}`],
    resolve: (response) => {
      var item = itemList.getItemFromResults(response, response.get('itemNo'));
      response.say(`Marking ${item.text} as done`);
      return markItemChecked(tgtDocId, item.id, item.html);
  }}, {
    expecting: [`delete item [[itemNo]]`],
    resolve: (response) => {
      var item = itemList.getItemFromResults(response, response.get('itemNo'));
      response.say(`Deleting ${item.text}`);
      return quipSvc.deleteListItem(tgtDocId, item.id);
  }}, {
    expecting: ['go back'],
    resolve: function (response) {
      ack(response);
  }}]
});

violet.respondTo(['what all needs to be done', 'what all is open on my to do'],
  (response) => {
    return quipSvc.getItemsP(tgtDocId, /*asList*/true).then((items)=>{
      items = flagItemsAsDone(items);
      items = items.children.filter(i=>{return (i.done==false);});
      response.set('Items', items);
      itemList.respondWithItems(response, items);
    });
});

violet.respondTo(['whats all is on my to do'],
  (response) => {
    return quipSvc.getItemsP(tgtDocId, /*asList*/true).then((items)=>{
      items = flagItemsAsDone(items);
      items = items.children;
      response.set('Items', items);
      itemList.respondWithItems(response, items);
    });
});

violet.respondTo(['mark item as checked'],
  (response) => {
    var tgtItem = response.get('tgtItem');
    if (tgtItem.id && tgtItem.html) {
      response.say(`Marking ${tgtItem.text} as done`);
      return markItemChecked(tgtDocId, tgtItem.id, tgtItem.html);
    } else
      response.say(`Which item are you referring to`);
});

// use soundex https://en.wikipedia.org/wiki/Soundex
var soundex = require('soundex');
var voiceMatchScores = (voiceInp, items) => {
  var _getSig = (str) => {
    return str.split(' ').map(w=>{return soundex(w);}).sort();
  }
  var voiceInpSig = _getSig(voiceInp);
  // console.log('voiceInpSig: ', voiceInpSig);
  return items.map(item=>{
    var itemSig = _getSig(item.text);
    // console.log('item:    ', item.text);
    // console.log('itemSig: ', itemSig);
    var matches = 0;
    voiceInpSig.forEach(inpWSig=>{
      var fMatched = itemSig.find(itemWSig=>{return inpWSig==itemWSig;});
      if (fMatched) matches++;
    });
    // console.log('matchScore: ', Math.trunc(100*matches/voiceInpSig.length), matches, voiceInpSig.length);
    return Math.trunc(100*matches/voiceInpSig.length);
  });
};

violet.respondTo(['mark [[itemName]] as {checked|done}'],
  (response) => {
    return quipSvc.getItemsP(tgtDocId, /*asList*/true).then((items)=>{
      var matchScores = voiceMatchScores(response.get('itemName'), items.children);
      // console.log('matchScores: ', matchScores);
      var hi=[], lo=[]; // indices of target items
      matchScores.forEach((score, ndx)=>{
        if (score>65) hi.push(ndx);
        if (score<35) lo.push(ndx);
      });
      // console.log(hi, lo, matchScores.length);

      // if high match with 1 item and low match with *all* other items
      if (hi.length==1 && matchScores.length-1==lo.length) {
        var tgtItem = items.children[hi[0]];
        response.say(`Got it. Marking ${tgtItem.text} as done.`);
        return markItemChecked(tgtDocId, tgtItem.id, tgtItem.html);
      }

      // if high/mid match with 2-3 items and low match with *all* other items (length-3)
      if (lo.length>=matchScores.length-3) {
        var matchItems = matchScores
              .map((score, ndx)=>{return (score>=35) ? items.children[ndx] : null;})
              .filter(i=>{return i!=null;});

        response.set('Items', matchItems);
        itemList.respondWithItems(response, matchItems);
        return;
      }

      // not sure we can do better
      response.say('Sorry. I could not find a match for [[itemName]]. Please try again or use a web interface.')
    });
});
