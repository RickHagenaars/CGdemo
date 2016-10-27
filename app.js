var SerialPort 	= require('serialport');
var prompt 		= require('prompt');
var _ 			= require('lodash');
var math 		= require('mathjs');
var mqtt 		= require('mqtt');

// Add timestamp to logs
require('console-stamp')(console, '[HH:MM:ss.l]');

// Small configuration object
var config 		= {
	"order": 	[ "soilmoisture", "airtemperature", "lightintensity" ],
	"calculation": {
		"soilmoisture"		: "value * 0.1",
		"airtemperature" 	: "value * 2.5",
		"lightintensity"	: "value * 0.1"
	},
	"limits" 	: {
		"upper": 	100,
		"lower": 	0
	}
}

// Port selection at start of run
SerialPort.list(function (err, ports) {
	if(err)
	{
		console.error("Error detected while listing COM ports:", err);
		return;
	}

	if(ports.length == 0)
	{
		console.log("No COM ports were detected");
		return;
	}
	else if(ports.length == 1)
	{
		console.log("Com port automaticly detected", ports[0].comName);
		zigbeeToMQTT(ports[0].comName);
	}
	else
	{
		console.log("Please specify which COM port should be used");
		ports.forEach(function(port, portNumber) {
			console.log("[" + (portNumber + 1) + "]", port.comName, port.manufacturer);
		});

		prompt.start();
		prompt.get(['Port'], function (err, result) {
			if(err)
			{
				console.log("Error occured during manual input", err);
			}

			if(!ports[(_.toInteger(result.Port) - 1)])
			{
				console.log("Invalid COM port specified");
			}
			else
			{
				zigbeeToMQTT(ports[(_.toInteger(result.Port) - 1)].comName);
			}
		});
	}

});

var zigbeeToMQTT 	= function(zigbeePort)
{
	console.log("Start listening to zigbee module on port", zigbeePort);
	var comPort			= new SerialPort(zigbeePort, { parser: SerialPort.parsers.readline('\n') });
	var parser 			= math.parser();
	var client  		= mqtt.connect('mqtt://test.mosquitto.org');

	comPort.on('error', function(err)
	{
		console.error('Error: ', err.message);
	});

	client.on('error', function (err)
	{
		console.error('Error occured in connection to MQTT server:', err);
	});

	client.on('connect', function ()
	{
		console.log('Connected to MQTT server');
	});

	comPort.on('data', function (data)
	{
		var splitted 	= data.split(",");
		if(splitted.length >= 4)
		{
			var satelliteId 		= splitted[0];
			_.forEach(config.order, function(type, n)
			{
				var value 			= Math.max(config.limits.lower, Math.min(config.limits.upper, Math.round(parser.eval(config.calculation[type].replace("value", _.toNumber(splitted[(n+1)]))))));

				var topicStructure	= [ satelliteId, type ];
				client.publish(topicStructure.join('/'), _.toString(value));

				console.log(topicStructure.join('/'), _.toNumber(splitted[(n+1)]), value + "%");
			});
		}
	});
}