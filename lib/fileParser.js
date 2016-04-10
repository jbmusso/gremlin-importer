/**
 * @fileoverview The graph file parser.
 * @author  Victor O. Santos Uceta
 */
'use strict';

import fs from 'fs';
import gexf from 'gexf';
import dot from 'graphlib-dot';
import csv from 'fast-csv';
import ProgressBar from 'progress';

/*
 * @constructor
 * @param {object} The module settings.
 */
function FileParser(args) {

    /* Setting up defaults */
    this.componentType = args.type;
    this.delimiter = args.delimiter;
    this.format = args.format;
    this.file = args.file;
    this.verbose = args.verbose;
    this.lnCount = 0;
    this.bar = null;
    this.colTypes = null;
    this.stream = null;

    /* Checking if the file exist */
    try {
        fs.statSync(this.file);
    } catch (e) {
        throw new Error("Error: provided file not found");
    }

}


/*
 */
FileParser.prototype.computeLines = function (callback) {

    /* logging message */
    console.log("Computing line count...");
    /* initializing variables */
    var self = this;
    var i, count = 0;
    /* compute number of lines in the file */
    fs.createReadStream(this.file)
        .on('data', function (chunk) {
            for (i = 0; i < chunk.length; ++i)
                if (chunk[i] == 10) count++;
        })
        .on('end', function () {
            /* logging number */
            console.log("Total lines in file: " + count + "\n");
            /* If this is an edge csv, and the number of lines is not divisible by 3, throw error */
            if (self.format === 'csv' && self.componentType === 'e' && count % 3 !== 0) {
                throw new Error("The number of lines in an edge csv must be divisible by 3, i.e. the edge file is in the wrong format.");
            }
            /* setting the properties */
            self.lnCount = count;
            callback();
        });
};

/*
 */
FileParser.prototype.activateProgress_ = function () {

    var total;

    /* Computing progress bar total */
    switch (this.format) {
        case 'csv':
            if (this.componentType == 'v') {
                total = this.lnCount;
            } else if (this.componentType == 'e') {
                total = this.lnCount / 3;
            }
            break;
    }

    /* Instantiating progress bar */
    this.bar = new ProgressBar('  importing [:bar] :percent :etas', {
        complete: '=',
        incomplete: ' ',
        width: 40,
        total: total
    });
};

/*
 */
FileParser.prototype.tickProgress = function (n) {

    /* increasing tick if present */
    if (this.bar) {
        this.bar.tick(n);
    }
};

/*
 */
FileParser.prototype.pauseStream = function () {

    /* pausing readable stream */
    if (this.stream) {
        this.stream.pause();
    }
};

/*
 */
FileParser.prototype.resumeStream = function () {

    /* resuming readable stream */
    if (this.stream) {
        this.stream.resume();
    }
};

/*
 */
FileParser.prototype.streamIsPaused = function () {

    /* resuming readable stream */
    if (this.stream) {
        return this.stream.isPaused();
    }else{
        return false;
    }
};


/*
 */
FileParser.prototype.readCSV_ = function (progressCallback, doneCallback) {

    /* this object */
    var self = this;
    /* flag to read the types */
    var typesReaded = false;
    var edgeComp = [];

    /* Activate the progress bar */
    this.activateProgress_();

    /* create stream */
    this.stream = fs.createReadStream(this.file);

    /* Open file stream and parse csv*/
    this.stream.pipe(csv({objectMode: true, headers: self.componentType === 'v', delimiter: this.delimiter}))
        .on("data", function (data) {

            /* reading second row, i.e. types */
            if (!typesReaded && self.componentType === 'v') {
                /* trimming and lower casing column types */
                for (var prop in data) {
                    data[prop] = data[prop].trim().toLowerCase();
                }
                /* Set the columns */
                self.colTypes = data;
                typesReaded = true;
                /* dont return this column */
                return;
            } else if (self.componentType === 'e') {
                /* pushing the component */
                edgeComp.push(data);
                /* if we have 3 lines, join the components */
                if (edgeComp.length == 3) {
                    /* Send joined components */
                    progressCallback({src: edgeComp[0], trg: edgeComp[1], edge: edgeComp[2]});
                    /* Empty array component */
                    edgeComp = [];
                }
                return;
            }

            /* Send progress */
            progressCallback(data);
        })
        .on("end", function () {
            /* done callback */
            doneCallback();
        });
};
/*
 */
FileParser.prototype.readXLSX_ = function (progressCallback, doneCallback) {

};
/*
 */
FileParser.prototype.readGEXF_ = function (progressCallback, doneCallback) {

};
/*
 */
FileParser.prototype.readDOT_ = function (progressCallback, doneCallback) {

};

/*
 * Validates the configuration.
 * @private
 * @return {boolean} Is valid or not.
 */
FileParser.prototype.parse = function (progressCallback, doneCallback) {

    /* The collecting array */
    var elements = [];

    /* checking which parsing function to call */
    switch (this.format) {
        case 'csv':
            /* Parse the csv and notify in streams */
            this.readCSV_(function (data) {
                /* If there is a progress callback, call */
                if (progressCallback) {
                    progressCallback(data);
                }
            }, function (data) {
                /* If there is a done callback */
                if (doneCallback) {
                    doneCallback();
                }
            });
            break;
        case 'xlsx':

            break;
        case 'gexf':

            break;
        case 'dot':

            break;
    }

};

export default FileParser;
