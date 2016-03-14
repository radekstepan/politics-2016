import React from 'react';
import moment from 'moment';
import d3 from 'd3';
import _ from 'lodash';
import path from 'path';
import capitalize from 'underscore.string/capitalize';
import bs from 'binarysearch';
import cls from 'classnames';

import axes from '../modules/axes.js';

import cfg from '../../../config.json';

// Load the data.
import cand from '../../../data/candidates';
import events from '../../../data/events.json';

let name = (k) => _.map(k.split('-'), capitalize).join(' ');

export default React.createClass({

  displayName: 'Chart.jsx',

  getInitialState() {
    return { 'date': null, 'pos': false };
  },

  render() {
    let { date, pos } = this.state;

    let legend;
    if (date) {
      let candidates = [];
      // Find candidates with odds on this date.
      _.forOwn(cand, (v, k) => {
        let i = bs(v.d, date, ({d}, find) => {
          if (d > find) return 1;
          else if (d < find) return -1;
          return 0;
        });

        if (i == -1) return;

        candidates.push({ k, 'm': v.d[i].m });
      });

      // Map into a list.
      candidates = _(candidates).sortBy('m').map((o) => {
        return (
          <div key={o.k} className={'candidate'/*`candidate ${o.k}`*/}>
            <div className="median">{o.m.toFixed(1)}%</div>
            <div className="name">{name(o.k)}</div>
          </div>
        );
      }).value().reverse();

      // Show the tooltip.
      if (candidates.length) {
        legend = (
          <div className={cls('legend', { 'left': pos, 'right': !pos })}>
            <div className="date">{date}</div>
            <div className="candidates">
              {candidates}
            </div>
          </div>
        );
      }
    }

    return (
      <div id="chart">
        {legend}
        <div className="svg" ref="el" />
      </div>
    );
  },

  componentDidMount() {
    let self = this;

    let a = 'Z', b = '0', maxQ3 = 0;
    _.forOwn(cand, (v, k) => {
      if (v.s.firstD < a) a = v.s.firstD;
      if (v.s.lastD > b) b = v.s.lastD;
      if (v.s.maxQ3 > maxQ3) maxQ3 = v.s.maxQ3;
    });

    // Fix the beginning of the chart.
    a = '2015-06-12';

    // Number of days between the start and end of odds tracking.
    let days = moment(moment(b)).diff(moment(a), 'days');

    // Get available space.
    // let { height, width } = this.refs.el.getBoundingClientRect();
    let height = 600, width = 920;

    // Limit width.
    // width = Math.min( width, 920 );

    let margin = { 'top': 30, 'right': 160, 'bottom': 40, 'left': 50 };
    width -= margin.left + margin.right;
    height -= margin.top + margin.bottom;

    // Scales.
    let x = d3.time.scale().range([ 0, width ]);
    let y = d3.scale.linear().range([ height, 0 ]);

    // Axes.
    let xAxis = axes.time(height, x, days);
    let yAxis = axes.points(width, y);

    // Line generator.
    let line = d3.svg.line()
    // .interpolate("linear")
    .interpolate("monotone")
    .x((o) => x(new Date(o.d))) // convert to Date only now
    .y((o) => y(o.m));

    // Quartiles area.
    let quart = d3.svg.area()
    .interpolate("monotone")
    .x ((o) => x(new Date(o.d))) // convert to Date only now
    .y0((o) => y(o.m - o.q))
    .y1((o) => y(o.m + o.q));

    // Get the minimum and maximum date, and % chance of 0 to 100.
    x.domain([ new Date(a), new Date(b) ]);
    y.domain([ 0, maxQ3 ]).nice();

    // Add an SVG element with the desired dimensions and margin.
    let svg = d3.select(this.refs.el).append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    // Show legend for this day.
    .on("mousemove", function() {
      let [ mX, mY ] = d3.mouse(this);
      mX -= margin.left;
      let date = moment(x.invert(mX)).format('YYYY-MM-DD');
      self.setState({ date, 'pos': (mX / width) > 0.5 });
    });

    let g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

    // Add the clip path so that lines are not drawn outside of the boundary.
    g.append("defs").append("svg:clipPath")
    .attr("id", "clip")
    .append("svg:rect")
    .attr("id", "clip-rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", width)
    .attr("height", height);

    // Add the days x-axis.
    g.append("g")
    .attr("class", "x axis day")
    .attr("transform", `translate(0,${height})`)
    .call(xAxis);

    // Add the years x-axis?
    let yrAxis = axes.year(height, xAxis, days);

    g.append("g")
    .attr("class", "x axis year")
    .attr("transform", `translate(0,${height})`)
    .call(yrAxis)
    .selectAll("text")
    .attr("y", 40);

    // Add the y-axis.
    g.append("g")
    .attr("class", "y axis")
    .call(yAxis);

    // Add the line paths for each candidate.
    _.forOwn(cand, (v, k) => {
      let c = g.append("g")
      .on("mouseover", () => t(true))
      .on("mouseout", () => t(false));

      let t = (s) => c.classed({ [`candidate ${k}`]: true, 'selected': s });
      t(false);

      // The quartiles.
      c.append('path')
      .attr('class', 'quartiles')
      .attr('d', quart(v.d));

      // The median perceived probability.
      c.append("path")
      .attr("class", 'median')
      .attr("d", line(v.d));


      let tX = width + 10, tY = y(v.s.lastM);

      if (k == 'ted-cruz') tY -= 8;

      // The name.
      c.append("text")
  		.attr("transform", `translate(${tX},${tY})`)
  		.attr("dy", ".35em")
      .attr("class", "name")
  		.text(`${name(k)} ${v.s.lastM.toFixed(1)}%`);
    });

    // Now for the events.
    let evtAxis = xAxis
    .orient("top")
    .tickSize(height)
    .tickFormat((o) => o.t);

    let evts = g.append("g").attr("class", "events");

    _.each(events, (evt, i) => {
      let xC = x(new Date(evt.d));
      let yC = 10 + (30 * i);

      evts.append("line")
			.attr({
				'x1': xC,
        'x2': xC,
				'y1': height,
				'y2': yC })
			.attr("class", "line");

    	let text = evts.append("text")
			.attr("class", "text")
			.attr("x", xC + 5)
			.attr("y", yC + 10)
			.attr("text-anchor", "right")
			.text(evt.t);

      // Background box.
      let bbox = text.node().getBBox();
      evts.insert("rect", ".text")
      .attr("x", bbox.x)
      .attr("y", bbox.y)
      .attr("width", bbox.width - 4)
      .attr("height", bbox.height)
      .attr("class", "box");
    });
  }

});
