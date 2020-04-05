'use strict';

const assert = require('assert');
const NamedMapProviderReporter = require('../../../../lib/stats/reporter/named-map-provider-cache');

describe('named-map-provider-reporter', function () {
    it('should report metrics every 100 ms', function (done) {
        const oldStatsClient = global.statsClient;

        global.statsClient = {
            gauge: function (metric, value) {
                this[metric] = value;
            }
        };

        const dummyCacheEntries = [
            {
                k: 'foo:template_1',
                v: { instantiation_1: 1 }
            },
            {
                k: 'bar:template_2',
                v: { instantiation_1: 1, instantiation_2: 2 }
            },
            {
                k: 'buz:template_3',
                v: { instantiation_1: 1, instantiation_2: 2, instantiation_3: 3 }
            }
        ];

        const reporter = new NamedMapProviderReporter({
            namedMapProviderCache: {
                providerCache: {
                    dump: () => dummyCacheEntries,
                    length: dummyCacheEntries.length
                }
            },
            intervalInMilliseconds: 100
        });

        reporter.start();

        setTimeout(() => {
            reporter.stop();

            assert.strictEqual(
                global.statsClient['windshaft.named-map-provider-cache.named-map.count'],
                3
            );

            assert.strictEqual(
                global.statsClient['windshaft.named-map-provider-cache.named-map.instantiation.count'],
                6
            );

            global.statsClient = oldStatsClient;

            done();
        }, 110);
    });
});
