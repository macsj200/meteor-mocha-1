import { Template } from 'meteor/templating';
import { Mocha } from 'meteor/gagarin:mocha';
import { Receiver } from '../utils/Receiver.js';
import { captureAllOutput } from '../utils/captureAllOutput';
import { Reports } from './Reports.js';
import { ReactiveVar } from 'meteor/reactive-var';
import Terminal from 'xterm';
import 'xterm/src/xterm.css';
import './reporter.html';
import './reporter.css';

Template.reporter.onCreated(function () {
  this.subscribe('gagarin.reports');
  this.currentSource = new ReactiveVar('client');
});

Template.reporter.helpers({
  currentSource () {
    return Template.instance().currentSource.get();
  },
  activeIf (source) {
    if (Template.instance().currentSource.get() === source) {
      return 'active';
    }
  },
  status (source) {
    if (Reports.find({ source, name: 'fail' }).count() > 0) {
      return 'error';
    }
    return 'success';
  }
});

Template.reporter.events({
  'click [data-source]': function (e, t) {
    t.currentSource.set(e.currentTarget.dataset.source);
  }
});

Template.reporter.onRendered(function () {
  const nCols = 140;
  const xterm = new Terminal({
    cols: nCols,
    rows: 40,
    convertEol: true,
    cursorBlink: true,
    scrollback: 0, // should result in infinite buffer?
  });
  let waitingForResize = false;
  const resize = function () {
    if (!waitingForResize) {
      setTimeout(function () {
        xterm.resize(nCols, xterm.lines.length);
        waitingForResize = false;
      }, 50);
      waitingForResize = true;
    }
  };
  Mocha.reporters.Base.useColors = true;
  Mocha.reporters.Base.window.width = xterm.cols;

  xterm.open(this.find('.xterm'));

  this.autorun(() => {
    const currentSource = this.currentSource.get();
    const receiver = new Receiver(Mocha.reporters.spec);
    let output;
    xterm.reset();
    Reports.find({
      source: currentSource
    }).observe({
      added (doc) {
        if (doc.name === 'start') {
          output = captureAllOutput({
            onOutput: xterm.write.bind(xterm),
            onUpdate: resize,
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
