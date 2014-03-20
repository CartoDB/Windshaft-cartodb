{"version":"1.0.1",
	"layers":[{
    "type":"cartodb",
	  "options":{
      "sql":"select 1 as id, ST_Transform(ST_SetSRID(ST_MakePoint(x/1000,x/2000),4326),3857) as the_geom_webmercator FROM generate_series(-170000,170000) x",
	    "cartocss":"#style{ marker-width: 12;}",
	    "cartocss_version":"2.1.1",
      "Interactivity":"id"
    }
  }]
}
