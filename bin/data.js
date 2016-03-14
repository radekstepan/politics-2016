#!/usr/bin/env node
"use strict";

let os = require('os');
let path = require('path');
let fs = require('fs');
let http = require("http");
let Xray = require('x-ray');
let phantom = require('x-ray-phantom');
let _ = require('lodash');
let stats = require('simple-statistics');
let as = require('async');

// The candidates.
let config = require('../config.json');

const DEV = true;

// Test webserver.
let server = (cb) => {
  if (!DEV) return cb(null, null);

  let listener = http.createServer((req, res) => {
    let k = _.last(req.url.split('/'));

    let p = path.resolve(__dirname, `../test/fixtures/${k}.html`);
    let html = fs.readFile(p, 'utf-8', (err, html) => {
      if (err) {
        res.writeHead(404);
      } else {
        res.writeHead(200, { "Content-Type": "text/html" });
      }
      res.end(html);
    });
  }).listen(null, (err) => {
    cb(err, !err ? listener.address().port : null);
  });
};

// Fetch the odds.
let fetch = (port, done) => {
  // PhantomJS driver.
  let x = Xray()
  .driver(phantom({
    'webSecurity': false
  }));

  as.eachSeries(config.candidates, (k, cb) => {
    // Live or test url?
    let url;
    if (!DEV) {
      url = [
        'http://www.oddschecker.com',
        'politics',
        'us-politics',
        'us-presidential-election-2016',
        'winner',
        'bet-history',
        k,
        'all-history'
      ].join('/');
    } else {
      url = `http://0.0.0.0:${port}/${k}`;
    }

    console.log(url);

    // x(url, '#wrapper-content @html', {
    x(url, '#all-history .eventTable', {
      'b': [ 'thead td span @class' ],
      'd': x('tbody tr.eventTableRow', [ {
        'date': 'td',
        'odds': [ 'td @html' ]
      } ])
    })((err, res) => {
      if (err) return cb(err);

      // Last odds for each bookmaker.
      let last = [];

      // The historical odds.
      let d = [];

      // Parse the fraction.
      let parse = (t) => 100 * (1 / (eval(t) + 1));

      // Fix number to 2 decimals.
      let fix = (n) => +n.toFixed(2);

      let maxM = 0, maxQ3 = 0;

      // For each row.
      _.each(res.d.reverse(), (data) => {
        let list = [];

        // Skip today.
        if (/:/.test(data.date)) return;

        // For each column.
        _.each(data.odds.slice(1), (t, i) => {
          // Get the list of values.
          let l = _(t.split(/<(?:.|\n)*?>/gm)).map((t) => t.trim()).filter('length').value();

          // Any changes?
          if (!l.length) {
            // Do we have odds from before?
            if (last[i]) {
              // Continue the same as yesterday.
              list.push(last[i]);
            }
          } else {
            // Are we suspended?
            if (l[0] == 'SUSP') {
              // Did we change odds right before?
              if (l.length > 1) {
                list.push(parse(l[1]));
              }
              // This bookie is offline now.
              last[i] = null;
            } else {
              // Get the last value of the day.
              last[i] = parse(l[0]);
              list.push(last[i]);
            }
          }
        });

        let m = stats.harmonicMean(list);
        let q = (stats.interquartileRange(list) || m) / 2;

        if (m > maxM) {
          maxM = m ; maxQ3 = m + q;
        };

        d.push({
          'd': data.date,
          'm': fix(m),
          'q': fix(q),
          'h': fix(stats.max(list)),
          'l': fix(stats.min(list))
        });
      });

      // The stats.
      let s = {
        // Last median value.
        'lastM': _.last(d).m,
        // Maximum median value.
        'maxM': +maxM.toFixed(2),
        // Maximum q3 at max median value.
        'maxQ3': +maxQ3.toFixed(2),
        // The first date.
        'firstD': d[0].d,
        // The last date.
        'lastD': _.last(d).d
      };

      // Output file path.
      let f = path.join(__dirname, '../data/candidates', `${k}.json`);

      // Save the JSON.
      fs.writeFile(f, JSON.stringify({ s, d }, null, 2), cb);
    });
  }, done);
};

as.waterfall([
  server,
  fetch,
], (err) => {
  if (err) throw err;
  process.exit();
});
