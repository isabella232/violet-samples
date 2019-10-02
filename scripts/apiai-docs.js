/* Copyright (c) 2017-present, salesforce.com, inc. All rights reserved */
/* Licensed under BSD 3-Clause - see LICENSE.txt or git.io/sfdc-license */

'use strict';

var violet = require('violet').script();

// Implementing https://docs.api.ai/docs/dialogs

//-- import hotelReservationService

violet.addInputTypes({
  '[[destination]]': 'AMAZON.US_CITY',
  '[[checkinDate]]': 'AMAZON.DATE',
  '[[checkoutDate]]': 'AMAZON.DATE',
});

violet.addPhraseEquivalents([
]);


violet.respondTo({
  expecting: ['Book a hotel in [[destination]] check in [[checkinDate]] check out [[checkoutDate]]'],
  resolve: (response) => {
    response.addGoal('bookHotel');
  }
});

violet.defineGoal({
  goal: 'bookHotel',
  resolve: (response) => {
    if (!response.ensureGoalFilled('checkinDate')
        || !response.ensureGoalFilled('checkoutDate')
        || !response.ensureGoalFilled('destination') ) {
          return false; // dependent goals not met
        }
    var checkinDate = response.get('checkinDate');
    var checkoutDate = response.get('checkoutDate');
    var destination = response.get('destination');
    hotelReservationService.getReservationInfo(checkinDate, checkoutDate, destination, (numNights, dailyRate)=>{
      response.set('numNights', numNights);
      response.set('dailyRate', dailyRate);
      response.addGoal('confirmBooking');
      response.ask('Book hotel room at ' + destination + ' checking in on ' + checkinDate + ' for ' + numNights + ' at ' + dailyRate + ' dollars per night');
      // response.say('Reserved hotel room');
    });
    return true;
  }
});


violet.defineGoal({
  goal: 'checkinDate',
  prompt: ['What date', 'When are you arriving?'],
});
violet.respondTo({
    expecting: ['[[checkinDate]]', '[[checkinDate]]'],
    resolve: (response) => {
      response.set('checkinDate', response.get('checkinDate') );
    }
});


violet.defineGoal({
  goal: 'checkoutDate',
  prompt: 'xxxx xxxx',
});
violet.respondTo({
    expecting: ['[[checkoutDate]]', '[[checkoutDate]]'],
    resolve: (response) => {
      response.set('checkoutDate', response.get('checkoutDate') );
    }
});


violet.defineGoal({
  goal: 'destination',
  prompt: 'xxxx xxxx',
});
violet.respondTo({
    expecting: ['[[destination]]', '[[destination]]'],
    resolve: (response) => {
      response.set('destination', response.get('destination') );
    }
});


violet.defineGoal({
  goal: 'confirmBooking',
  prompt: 'Book hotel room at {{destination}} checking in on {{checkinDate}} for {{numNights}} at {{dailyRate}} dollars per night'
});


violet.respondTo({
  expecting: ['[[confirmBooking]]', 'Yes'],
  resolve: (response) => {
    hotelReservationService.reserve(checkinDate, checkoutDate, destination, (numNights, dailyRate)=>{
      response.say('Reserved hotel room');
    });
  }
});

violet.respondTo({
  expecting: ['[[confirmBooking]]', ['No', 'Cancel']],
  resolve: (response) => {
  }
});

violet.respondTo({
  expecting: ['[[confirmBooking]]', 'Change check in date'],
  resolve: (response) => {
    response.addGoal('checkinDate');
  }
});

violet.respondTo({
  expecting: ['[[confirmBooking]]', 'Yes'],
  resolve: (response) => {
    hotelReservationService.reserve(checkinDate, checkoutDate, destination, (numNights, dailyRate)=>{
      response.say('Reserved hotel room');
    });
  }
});
