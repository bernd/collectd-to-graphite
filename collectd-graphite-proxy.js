/* TODO(sissel): make connections retry/etc 
 * TODO(sissel): make graphite target configurable via command line
 *
 * This code is a work in progress.
 *
 * To use this, put the following in your collectd config:
 *
 * LoadPlugin write_http
 * <Plugin write_http>
 *   <URL "http://monitor:3012/post-collectd">
 *     Format "JSON"
 *   </URL>
 * </Plugin>
 *
 * This will make collectd write 'PUTVAL' statements over HTTP to the above URL.
 * This code below will then convert the PUTVAL statements to graphite metrics
 * and ship them to 'monitor:2003'
 */

var http = require("http");
var net = require("net");
var assert = require("assert");

try {
  var graphite_connection = net.createConnection(2003, host="monitor");
} catch (error) {
  throw error;
}
graphite_connection.on("close", function() {
  throw new Error("Connection closed");
});
graphite_connection.on("error", function() {
  throw new Error("Connection error");
});

var data_name = function(data, data_instance) {
  if (data_instance.length > 1) {
    return data + '-' + data_instance;
  } else {
    return data;
  }
}

var write_message = function(name, value, time) {
  console.log([name, value, time].join(' '));
  graphite_connection.write([name, value, time].join(' ') + "\n");
}

var request_handler = function(request, response) {
  var payload = '';

  request.addListener("data", function(chunk) {
    payload += chunk.toString();
  });

  request.addListener("end", function() {
    JSON.parse(payload).forEach(function(entry) {
      var plugin = data_name(entry.plugin, entry.plugin_instance),
          type = data_name(entry.type, entry.type_instance),
          hostname = entry.host.replace(/\./g, '_'),
          name = ['collectd', hostname, plugin, type].join('.');

      if (entry.dsnames.length > 1) {
        for (var i in entry.dsnames) {
          write_message(name + '_' +  entry.dsnames[i], entry.values[i], entry.time);
        }
      } else {
        write_message(name, entry.values[0], entry.time);
      }
    });

    response.writeHead(200, {"Content-Type": "text/plain"});
    response.write("OK");
    response.end();
  });
}

var server = http.createServer()
server.addListener("request", request_handler)
server.listen(3012);
