var Mocha = require('mocha');
var WebSocket = require('faye-websocket');
var createClass = require('asteroid').createClass;
var Spinner = require('cli-spinner').Spinner;
var minimist = require('minimist');
var Receiver = require('./Receiver.js');
var clear = require('cli-clear');

var spinner = new Spinner('  waiting for server... %s');
var argv = minimist(process.argv.slice(2));
var Asteroid = createClass();
var asteroid = new Asteroid({
  endpoint: 'ws://localhost:' + (argv.port || 3000) + '/websocket',
  SocketConstructor: WebSocket.Client,
  reconnectInterval: 1000,
});
var reporter = argv.reporter ? Mocha.reporters[argv.reporter] : Mocha.reporters.spec;

if (argv.help) {
  console.log([
'Usage:',
'',
'--port     <number>   specify on which port meteor is running (default: 3000)',
'--reporter <reporter> choose a custom mocha reporter (default: spec)',
'--once                only run once',
''].join('\n'));
  process.exit();
}

if (!reporter) {
  console.error(`Unknown reporter: "${argv.reporter}"\n`);
  process.exit(1);
}

var hasError = true;
var receiver;

asteroid.subscribe('Gagarin.Reports.all');
asteroid.on('connected', function () {
  if (!argv.once) {
    spinner.stop();
  }
});

asteroid.on('disconnected', function () {
  if (!argv.once) {
    spinner.start();
  }
});

asteroid.ddp.on('ready', function () {
  if (argv.once) {
    process.exit(hasError ? 1 : 0);
  } else {
    spinner.stop();
  }
});

asteroid.ddp.on('added', function (options) {
  var collection = options.collection;
  var fields = options.fields;
  if (collection !== 'Gagarin.Reports') {
    return;
  }
  if (fields.name === 'start') {
    if (!argv.once) {
      spinner.stop();
      clear();
    }
    hasError = false;
    receiver = new Receiver(reporter);
  }
  if (fields.name === 'fail' && !hasError) {
    hasError = true;
  }
  if (receiver) {
    receiver.emit.apply(receiver, [fields.name].concat(fields.args));
  }
  if (fields.name === 'end') {
    receiver = null;
  }
});
