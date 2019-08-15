/* Copyright (c) 2017-present, salesforce.com, inc. All rights reserved */
/* Licensed under BSD 3-Clause - see LICENSE.txt or git.io/sfdc-license */

var quip = new require('./api.js');
var quipEx = new require('./apiEx.js');
var utils = new require('./utils.js');
var Promise = require('bluebird');
var cheerio = require('cheerio');


var client = new quip.Client({accessToken: process.env.QUIP_TOKEN});

module.exports.getClient = ()=>{ return client; }

module.exports.getAuthenticatedUser = function(cb) {
  client.getAuthenticatedUser(cb);
};

var getThread = module.exports.getThread = (tid, wdoc=true, ndx=0)=>{
  client.getThread(tid, function(err, thread) {
    if (err) {
      console.log(err);
      return;
    }
    if (!thread) {
      console.log(`${tid} has null thread`)
      return;
    }
    if (!wdoc)
      if (thread.html) delete thread.html;
    console.log(utils.prettyJSON(utils.spaces(2*ndx) + 't-child: ', thread));
  });
};

var getFolder = module.exports.getFolder = (fid, ndx=0)=>{
  client.getFolder(fid, function(err, folders) {
      if (!folders) {
        console.log(`${fid} has null folders`)
        return;
      }
      console.log(utils.prettyJSON(utils.spaces(2*ndx) + 'child: ', folders));
      folders.children.forEach((child)=>{
        if (child['folder_id']) getFolder(child['folder_id'], ndx+1);
        if (child['thread_id']) getThread(child['thread_id'], /*wdoc*/false, ndx+1);
      });
  });
};

var appendToDoc = module.exports.appendToDoc = (tid, content, contentFormat)=>{
  var params = {
    threadId: tid,
    content: content,
    format: contentFormat,
    operation: quip.Operation.APPEND
  };
  client.editDocument(params, function(err) {
      if (err) console.log(err);
  });
};

var appendItemsWithinSection = module.exports.appendItemsWithinSection = (tid, sid, items)=>{
  if (!sid) sid = tid; //adds to end of document
  var params = {
    threadId: tid,
    sectionId: sid,
    format: 'markdown',
    content: items.join('\n\n'),
    operation: quip.Operation.AFTER_SECTION
  };
  client.editDocument(params, function(err) {
      if (err) console.log(err);
  });
};

module.exports.appendItems = (tid, items)=>{
  return getItemsP(tid, /*asList*/true).then((curItems)=>{
    var sid = null;
    if (curItems.children.length == 0) {
      sid = tid;
    } else {
      console.log(curItems);
      sid = curItems.children[curItems.children.length-1].id;
    }
    appendItemsWithinSection(tid, sid, items);
  });
};

module.exports.appendImage = (tid, imgName, img)=>{
  var params = {
    threadId: tid,
    blob: img,
    name: imgName
  };
  quipEx.putBlob(client, params, function(err, resp) {
      // if (err) console.log(err);
      if (err) {
        console.log(err.info);
        var data = err.httpResponse.req.socket;
        const sym = Object.getOwnPropertySymbols(data).find(s => {
          return String(s) === "Symbol(connect-options)";
        });
        console.log(data[sym].headers);
        console.log('err.httpResponse.req._header: ', err.httpResponse.req._header);
        console.log(err.httpResponse.req.res.headers);
        const outHeadersKeySym = Object.getOwnPropertySymbols(err.httpResponse.req).find(s => {
          return String(s) === "Symbol(outHeadersKey)";
        });
        console.log(err.httpResponse.req[outHeadersKeySym]);
        return;
      }
      appendToDoc(tid, `<img src='${resp.url}'>`, 'html');
  });
};

module.exports.modifyListItem = (tid, sid, items)=>{
  // really add to end
  var params = {
    threadId: tid,
    sectionId: sid,
    format: 'markdown',
    content: items.join('\n\n'),
    operation: quip.Operation.REPLACE_SECTION
  };
  client.editDocument(params, function(err) {
      if (err) console.log(err);
  });
};
module.exports.deleteListItem = (tid, sid)=>{
  // really add to end
  var params = {
    threadId: tid,
    sectionId: sid,
    operation: quip.Operation.DELETE_SECTION
  };
  client.editDocument(params, function(err) {
      if (err) console.log(err);
  });
};

var isLower = (t1, t2) => {
  if (t2 == t1) return false; // nothing is lower than itself
  switch (t2) {
  case undefined: return true; // everything is lower than the root/top
  case 'h1': return true; // already returned for h1
  case 'h2':
    if (t1 == 'h1')
      return false;
    else // t1 == 'h3'
      return true;
  case 'h3': return false;
  };
}


// if asList is true returns items as a single list
// if asList is false returns items within the categories headings as well as a categories list (which have items within them)
// returns all lists inside thread (document)
var getItems = module.exports.getItems = (tid, asList, cb)=>{
  client.getThread(tid, function(err, thread) {
    if (err) cb(err, null);
    var doc = cheerio.load(thread.html);

    // all list items
    var items = {
      children: []
    };
    var sections = {}; // only those with children
    var itemParent = items;
    doc('h1, h2, h3, div[data-section-style=7] li').each((ndx, el)=>{
      var cel = cheerio(el);
      var xtract = {
        tag:  cel.get(0).tagName, // temproary
        id:   cel.attr('id'),
        done: cel.attr('class')==='checked',
        text: cel.text().trim(),
      };
      if (xtract.tag === 'li') {
        xtract.html = cheerio(cel.children()[0]).html();
        itemParent.children.push(xtract);
        sections[itemParent.id] = itemParent;
      } else { // h1, h2, h3
        if (asList) return; // we don't do anything with headings
        xtract.html = cel.html();
        xtract.children = [];
        itemParent = xtract;
      }
    });
    if (asList)
      cb(null, items);
    else {
      // drop the keys in sections - it is used to prevent duplicates
      sections = Object.keys(sections).map(s=>{return sections[s];});
      cb(null, sections);
    }
  });
};


var getItemsP = module.exports.getItemsP = Promise.promisify(getItems);
