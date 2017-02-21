import { Template } from 'meteor/templating';
import { Mocha } from 'meteor/gagarin:mocha';
import { Receiver } from './Receiver.js';
import { captureAllOutput } from './captureAllOutput';
import { Reports, SUBSCRIPTION_ALL_REPORTS } from 'meteor/gagarin:mocha-driver';
import { ReactiveVar } from 'meteor/reactive-var';
import { fontSize } from './fontSize.js';
import { $ } from 'meteor/jquery';
import Terminal from 'xterm/dist/xterm.js';
import 'xterm/dist/xterm.css';
import './reporter.html';
import './reporter.css';

Template.reporter.onCreated(function () {
  this.subscribe(SUBSCRIPTION_ALL_REPORTS);
  this.currentSuiteId = new ReactiveVar(this.data.suites[0].id);
  this.nColumns = new ReactiveVar(140);
});

Template.reporter.helpers({
  currentSuiteId () {
    return Template.instance().currentSuiteId.get();
  },
  activeIf (suiteId) {
    if (Template.instance().currentSuiteId.get() === suiteId) {
      return 'active';
    }
  },
  status (suiteId) {
    if (Reports.find({ suiteId, name: 'fail' }).count() > 0) {
      return 'error';
    }
    return 'success';
  },
  icon (suiteId) {
    if (Reports.find({ suiteId, name: 'fail' }).count() > 0) {
      return Mocha.reporters.Base.symbols.err;
    }
    return Mocha.reporters.Base.symbols.ok;
  },
});

Template.reporter.events({
  'click .js-suite': function (e, t) {
    t.currentSuiteId.set(this.id);
  }
});

Template.reporter.onRendered(function () {
  const xterm = new Terminal({
    cols: this.nColumns.get(),
    rows: 60,
    convertEol: true,
    cursorBlink: true,
    scrollback: 2048,
  });
  let waitingForResize = false;
  this.resize = () => {
    if (!waitingForResize) {
      setTimeout(() => {
        const size = fontSize(this.find('.xterm .terminal'));
        const nColumns = Math.floor(window.innerWidth / size);
        this.nColumns.set(nColumns);
        xterm.resize(nColumns, xterm.lines.length);
        xterm.showCursor();
        waitingForResize = false;
      }, 50);
      waitingForResize = true;
    }
  };

  $(window).on('resize', this.resize);

  Mocha.reporters.Base.useColors = true;
  Mocha.reporters.Base.window.width = xterm.cols;

  xterm.open(this.find('.xterm'));
  xterm.on('refresh', this.resize);

  this.autorun(() => {
    this.nColumns.get(); // only depend on this variable ...
    const { mochaReporter } = Template.currentData();
    const currentSuiteId = this.currentSuiteId.get();
    const receiver = new Receiver(mochaReporter);
    let output;
    xterm.reset();
    this.resize();
    Reports.find({
      suiteId: currentSuiteId
    }, {
      sort: { index: 1 },
    }).observe({
      added (doc) {
        if (doc.name === 'start') {
          output = captureAllOutput({
            onOutput: xterm.write.bind(xterm),
          });
        }
        receiver.emit(doc.name, ...doc.args);
        if (doc.name === 'end' && output) {
          output.restore();
          output = null;
        }
      }
    });
  });
});

Template.reporter.onDestroyed(function () {
  $(window).off('resize', this.resize);
});
