#!/usr/bin/env node

const carrier = require('carrier');
const spawn = require('child_process').spawn;
const debug = require('debug')('escvp21');

const program = require('commander');
const pkg = require(__dirname + '/package.json');

const queryModel = require('./lib/query_model_name');

program
    .version(pkg.version)
    .usage('[options] <connect-command>')
    .option('-m, --model <model-name>',  'specify projctor model. Use \"auto\" to query REST API based on serial number. [auto]', 'auto')
    .option('-p --power <on or off>', 'Turn on or shutdown projector', /^(on|off)$/i)
    .option('-H --hreverse <on or off>', 'Enable or disable horizontal mirroring', /^(on|off)$/i)
    .option('-V --vreverse <on or off>', 'Enable or disable vertical mirroring', /^(on|off)$/i)
    .parse(process.argv);

const command = "sh";
const args = [
    "-c", program.args[0]
];

let queue = [
    "SNO?"
];

if (program.power) {
    queue.push("PWR " + program.power.toUpperCase());
}

if (program.hreverse) {
    queue.push("HREVERSE " + program.hreverse.toUpperCase());
}

if (program.vreverse) {
    queue.push("VREVERSE " + program.vreverse.toUpperCase());
}

queue = queue.concat([
    "LAMP?",
    "LUMINANCE?",
    "BRIGHT?",
    "CONTRAST?",
    "TINT?",
    "HREVERSE?",
    "VREVERSE?",
    "MSEL?",
    "ASPECT?",
    "PWR?",
    "SOURCE?"
]);

let pending = [];

const com = spawn(command, args);

function disconnect() {
    debug('Disconnecting ...');
    com.stdin.write("~\x04");
}

var timer;

carrier.carry(com.stdout, (line) => {
    if (timer) clearInterval(timer);
    timer = null;
    for(let response of line.split(':').slice(1)) {
        let currCommand = pending.shift();
        if (currCommand) {
            console.log(`response of ${currCommand}: ${response}`);
            if (currCommand == "SNO?" && program.model == "auto") {
                var m = response.match(/SNO=(.*)$/);
                if (m) {
                    var sno = m[1];
                    debug(`query model name for serial no ${sno}`);
                    queryModel(sno, (err, data) => {
                        debug('query response:');
                        if (err) {
                            console.log(`Model cannot be identified: ${err.message}`);
                        } else {
                            console.log(`Projector identified as ${data[0]}`);
                        }
                    });
                }
            }
        }
    }
}, 'ascii', /\r/);

com.stdout.on('data', (data) => {
    debug('received', data);
    const last = data.substr(data.length-1);
    if (last == ":") {
        let currCommand = queue.shift();
        if (currCommand) {
            pending.push(currCommand);
            debug(`Sending command: ${currCommand}`);
            com.stdin.write(currCommand + "\r");
        } else {
            disconnect();
        }
    }
});

com.stderr.pipe(process.stderr);

com.on('close', (code) => {
    debug(`child process exited with code ${code}`);
});

timer = setInterval( ()=> {
    debug('Sending <CR>');
    process.stdout.write('.');
    com.stdin.write("\r");
}, 2000);
