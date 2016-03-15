#!/usr/bin/env node
"use strict";

let Args = require('argparse').ArgumentParser;
let os = require('os');
let path = require('path');
let fs = require('fs');
let http = require("http");
let Xray = require('x-ray');
let phantom = require('x-ray-phantom');
let hl = require('highland');
let ndjson = require('ndjson');
let _ = require('lodash');
let stats = require('simple-statistics');

let parser = new Args();

parser.addArgument(
  [ '-t', '--test' ],
  {
    'help': 'Test fixtures are served via HTTP server',
    'nargs': 0
  }
);

var args = parser.parseArgs();

let through = (k) => {
  return hl((cb, next) => {
    cb(null, k + os.EOL);

    // Start a server in test mode.
    if (args.test) {
      server((err, listener) => {
        if (err) return cb(err);
        fetch(k, `http://0.0.0.0:${listener.address().port}/${k}`, (err) => {
          listener.close();
          cb(err, hl.nil);
        });
      });
    // Live odds.
    } else {
      fetch(k, [
        'http://www.oddschecker.com',
        'politics',
        'us-politics',
        'us-presidential-election-2016',
        'winner',
        'bet-history',
        k,
        'all-history'
      ].join('/'), (err) => {
        cb(err, hl.nil);
      });
    }
  });
};

process.stdin.pipe(hl.pipeline.apply(_, [
  hl(),
  ndjson.parse(),
  hl.map(through),
  hl.sequence()
])).pipe(process.stdout);

// Test webserver.
let server = (cb) => {
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
    cb(err, !err ? listener : null);
  });
};

// Fetch the odds.
let fetch = (k, url, cb) => {
  // PhantomJS driver.
  let x = Xray()
  .driver(phantom({
    'webSecurity': false
  }));

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
    let f = path.join(__dirname, '../data/odds', `${k}.json`);

    // Save the JSON.
    fs.writeFile(f, JSON.stringify({ s, d }, null, 2), cb);
  });
};
