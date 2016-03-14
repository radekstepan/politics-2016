import React from 'react';

import Page from '../../lib/PageMixin.js';

import Chart from '../Chart.jsx';

export default React.createClass({

  displayName: 'HomePage.jsx',

  mixins: [ Page ],

  render() {
    return <Chart />;
  }

});
