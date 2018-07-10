require('../../support/test_helper');

const assert = require('../../support/assert');
const TestClient = require('../../support/test-client');

describe.only('Special column names', function () {
  it('Reserved PG words', function (done) {
    const mapConfig = {
      "layers": [
        {
          "id": "8764e6ac-4599-4695-b118-f2b8f02b27f7",
          "type": "mapnik",
          "options":
          {
            source: { id: 'a1' },
            cartocss: TestClient.CARTOCSS.POLYGONS,
            cartocss_version: '2.3.0'
          }
        }
      ],
      "dataviews": {},
      "analyses": [
        {
          "id": "a1",
          "type": "buffer",
          "params": {
            "source": {
              "id": "a0",
              "type": "source",
              "params": {
                "query": "SELECT * FROM special_column_names"
              }
            },
            "radius": 50000
          }
        }
      ]
    };

    const testClient = new TestClient(mapConfig, 1234);

    testClient.getTile(0, 0, 0, function (err, res, image) {
      assert.ok(!err, err);
      testClient.drain(done);
    });
  });
});
