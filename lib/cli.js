#!/usr/bin/env node
/**
 * @fileoverview The cli entry point.
 * @author  Victor O. Santos Uceta
 */
'use strict';

import cli from 'commander';
import pkg from '../package.json';
import Importer from './importer';

cli
  .version(pkg.version)
  .usage('[options] <file>')
  .option('-h, --host <host>', 'The hostname or IP address of the gremlin server, by default localhost')
  .option('-p, --port <port>', 'The gremlin server port, by default 8182', parseInt)
  .option('-f, --format <format>', 'The file format, currently supported: csv', /^(csv)$/i)
  .option('-t, --type <type>', '(ONLY FOR CSV) Type of components contained in the file, can be e for edges or v for vertices', /^(v|e)$/i)
  .option('-d, --delimiter <delimiter>', '(ONLY FOR CSV) The value delimiter')
  .option('--prefix <prefix>', 'The gremlin server groovy prefix for the default graphTraversalSource, by default g')
  .option('--verbose', 'Print debbuging messages and internal information')
  .on('--help', function () {
    console.log('  Example:');
    console.log('');
    console.log('    $ gremlin-import -h localhost -p 8182 -f csv -t v /path/to/vertices.csv');
    console.log('');
    console.log('    The above command connects to localhost port 8182 and imports the graph contained in myGraph.gexf');
  })
  .parse(process.argv);

/* Setting the importer arguments */
var args = {
  "file": cli.args[0],
  "host": cli.host,
  "port": cli.port,
  "format": cli.format,
  "type": cli.type,
  "delimiter": cli.delimiter,
  "prefix": cli.prefix,
  "verbose": cli.verbose
};

var importer = new Importer(args);

importer.import(function (messageHash) {
  console.log("\n\nImport Summary");
  console.log("-----------------------");
  console.log("Total time: " + importer.getElapseTime());
  console.log("Inserted elements: " + importer.successCount);
  console.log("Warnings: " + Object.keys(messageHash).length);
  console.log("Errors: " + importer.errorCount);

  if(Object.keys(messageHash).length > 0) {
    console.log("\nWarnings");
    console.log("-----------------------");
    console.log("times\tmessage");
    for (var msg in messageHash) {
      console.log(messageHash[msg] + "\t" + msg);
    }
  }

  /* Exit process */
  process.exit();
});

