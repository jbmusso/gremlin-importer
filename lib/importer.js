/**
 * @fileoverview A module for importing graphs into a gremlin server.
 * @author  Victor O. Santos Uceta
 */
'use strict';

import moment from 'moment';
import FileParser from './fileParser';
import GremlinClient from './gremlinClient';

class Importer {
  /*
   * @param {object} The module settings.
   */
  constructor(args) {
    /* Setting up defaults */
    this.prefix = args.prefix;
    this.verbose = args.verbose;
    this.type = args.type;
    this.format = args.format;
    this.file = args.file;
    this.port = args.port || 8182;
    this.host = args.host || 'localhost';
    this.delimiter = args.delimiter || ",";

    /* validating the arguments, throw an exception otherwise */
    this.validate_();
    /* The file parser object */
    this.parser = new FileParser(this);
    /* The client object */
    this.client = new GremlinClient(this);

    /* insertion pending count */
    this.pendingCount = 0;
    /* the error counter */
    this.errorCount = 0;
    /* the successful insertion count */
    this.successCount = 0;
    /* Time measurements */
    this.then = null;
    this.now = null;
  }

  /*
   * Validates the configuration.
   * @private
   * @return {boolean} Is valid or not.
   */
  validate_() {
    /* validate the supported formats */
    if (typeof this.format !== "string" || !this.format.toLowerCase().match(/^(csv|gexf|dot)$/g)) {
      throw new Error("Error: Supported formats are: csv, gexf, dot");
    }

    /* Ok, now that the format is ok, lets just convert to lower case */
    this.format = this.format.toLowerCase();

    /* validate the type if it is csv */
    if (this.format === 'csv' && typeof this.type !== "string" || !this.type.toLowerCase().match(/^(v|e)$/g)) {
      throw new Error("Error: If csv, you must provide what type of component it contains: v, e");
    }

    /* Ok, now that the type is ok, lets just convert to lower case */
    this.type = this.type.toLowerCase();
  }

  /*
   * Validates the configuration.
   * @return {string} The human readable total time of the import.
   */
  getElapseTime() {
    return moment.duration(this.now.diff(this.then)).humanize()
  }

  /*
   * The import trigger function, this will begin the import procedure.
   * After the the import is done the callback will be triggered.
   * @param {function} The callback function.
   */
  import(callback) {
    /* This object reference */
    var self = this;
    var doneParsing = false;

    /* first open a transaction */
    self.client.openTransaction().then(function (result) {

      /* Start time measurement */
      self.then = moment();
      /* first compute lines */
      self.parser.computeLines(function () {
        /* done calculating lines, now proceed to parse */
        self.parser.parse(function (data) {
          /* Incrementing the pending count */
          self.pendingCount++;
          /* stream progress function */
          self.insert_([data], function () {
            /* If we are done parsing the file, and no more pending inserts, we are done */
            if (doneParsing && self.pendingCount == 0) {
              self.jobCompleted_(callback);
            }
          });
        }, function (dataArray) {
          /* setting the done parsing flag */
          doneParsing = true;
          /* finish function, may or may not return data */
          if (dataArray) {
            /* Incrementing the pending count */
            self.pendingCount += dataArray.length;
            /* stream progress function */
            self.insert_(dataArray, function () {
              /* If we are done parsing the file, and no more pending inserts, we are done */
              if (doneParsing && self.pendingCount == 0) {
                self.jobCompleted_(callback);
              }
            });
          } else if (callback) {
            /* done inserting invoke the callback if done with the pending inserts */
            if (self.pendingCount == 0) {
              self.jobCompleted_(callback);
            }
          }
        });
      });
      /* open transaction promise error */
    }, function (err) {
      console.log(err);
    });
  }

  jobCompleted_(callback) {
    var self = this;

    self.client.commitTransaction().then(function (results) {
      /* stop time measurement */
      self.now = moment();
      callback(self.client.messageHash);
    }, function (error) {
      /* there was an error commiting the transaction */
      console.log(error);
    });
  }

  /*
   * Insert all incoming elements (edges or vertices) into the gremlin server.
   * @private
   * @param {array<object>} Array with elements to insert.
   */
  insert_(elements, callback) {
    /* This object */
    var self = this;

    /* for each element to insert */
    elements.forEach(function (obj) {
      /* Inserting the object */
      self.client.insert(obj, self.type, function (result) {
        /* tick progress bar is present */
        self.parser.tickProgress(1);
        /* decrementing the pending counter */
        self.pendingCount--;
        /* increment the error count */
        self.successCount++;

        ///* If pending count exceeds 1000, pause stream */
        if (self.pendingCount > 10 && !self.parser.streamIsPaused()) {
          //console.log(" Pausing Stream");
          self.parser.pauseStream();
        } else if (self.parser.streamIsPaused() && self.pendingCount < 5 ) {
          //console.log(" Resuming Stream");
          self.parser.resumeStream();
        }

        /* call the done callback */
        callback();

      }, function (error, data) {
        /* tick progress bar is present */
        self.parser.tickProgress(1);
        /* decrementing the pending counter */
        self.pendingCount--;

        ///* If pending count exceeds 1000, pause stream */
        if (self.pendingCount > 10 && !self.parser.streamIsPaused()) {
          //console.log(" Pausing Stream");
          self.parser.pauseStream();
        } else if (self.parser.streamIsPaused() && self.pendingCount < 5 ) {
          //console.log(" Resuming Stream");
          self.parser.resumeStream();
        }

        /* increment the error count */
        self.errorCount++;
        /* Log the error, pending to log in to file */
        console.log(error);
        /* Log what data failed */
        console.log(data);
        /* call the done callback */
        callback();
      });
    });
  }
}

export default Importer;
