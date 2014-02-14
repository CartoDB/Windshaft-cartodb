{"version":"1.0.1",
	"layers":[{
    "type":"cartodb",
	  "options":{
      "sql":"select 1 as id, ST_SetSRID(ST_MakePoint(0,0),3857) as the_geom_webmercator",
	    "cartocss":"#style{ marker-width: 12;}",
	    "cartocss_version":"2.1.1",
      "Interactivity":"id"
    }
  }]
}
