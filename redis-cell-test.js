const firstDuration = 4000;
const firstDelay = 250;
const secondDuration = 4000;
const secondDelay = 250;


const redis = require('redis');
redis.add_command('CL.THROTTLE');
const client = redis.createClient();

client.on("error", function (err) {
    console.log("Error " + err);
});


const stats = {
    requests: 0,
    success: 0,
    limited: 0,
    maxBurst: 2,
    count: 2,
    period: 1
};

function doIt(cb) {
    client['CL.THROTTLE']('key12345', stats.maxBurst, stats.count, stats.period, (err, data) => {
        cb({
            limited: data[0],
            limit: data[1],
            remaining: data[2],
            retry: data[3],
            reset: data[4]
        });
    });
}

function run(callsDelay, totalTime) {
    let interval = setInterval(
        function() {
            doIt( ({limited, limit, remaining, retry, reset}) => {
                
                stats.requests++;
                limited ? stats.limited++ : stats.success++;

                log(stats.requests, limited, limit, remaining, retry, reset);
            });
        },
        callsDelay
    );
    
    setTimeout(() => {
        clearInterval(interval);
        console.log(stats);

        console.log("Max expected success", (totalTime / (stats.period * 1000) * stats.count) + stats.count + stats.maxBurst);
    },
    totalTime);
}

function log(request, limited, limit, remaining, retry, reset) {
    let currentTime = new Date().getTime() - initTime;
    console.log("\t" + request, "\t" + currentTime, "\t" + limited, "\t" + limit, "\t" + remaining, "\t" + retry, "\t" + reset);
}

const initTime = new Date().getTime();

run(firstDelay, firstDuration);
setTimeout(() => {
    run(secondDelay, secondDuration);
}, firstDuration + 2000);