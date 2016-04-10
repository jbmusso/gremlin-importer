/**
 * @fileoverview The gremlin client module.
 * @author  Victor O. Santos Uceta
 */
'use strict';

/* Get the gremlin module */
import Gremlin from 'gremlin';
import S from 'string';

class GremlinClient {
  /*
   * @param {object} The module settings.
   */
  constructor(args) {
    /* Create client connection */
    this.client = Gremlin.createClient(args.port, args.host, {session: false});
    /* The prefix of the groovy console */
    this.prefix = args.prefix || "g";
    /* We need the file parser here */
    this.parser = args.parser;
    /* Verbose flag */
    this.verbose = args.verbose;

    /* data types function enumerator */
    this.typeParser = {
      numeric: function (v) {
        return S(v).toFloat()
      },
      date: function (v) {
        return new Date(Date.parse(v))
      },
      boolean: function (v) {
        return S(v).toBoolean()
      },
      string: function (v) {
        return S(v).trim().s;
      },
      label: function (v) {
        return S(v).trim().s;
      }
    }

    /* Bullet list for end summary */
    this.messageHash = {};
  }

  /*
   * Validates the configuration.
   * @private
   * @return {boolean} Is valid or not.
   */
  openTransaction() {
    /* this reference */
    var self = this;

    return new Promise(function(resolve, reject) {
      /* Open the transaction */
      self.client.execute(self.prefix + ".tx().open();", {}, function (err, results) {
        if (!err) {
          resolve(results);
        } else {
          reject(err);
        }
      });

    });
  }

  /*
   * Validates the configuration.
   * @private
   * @return {boolean} Is valid or not.
   */
  commitTransaction() {
    /* this reference */
    var self = this;

    return new Promise(function(resolve, reject) {
      /* Open the transaction */
      self.client.execute(self.prefix + ".tx().commit();", {}, function (err, results) {
        if (!err) {
          console.log(results);
          resolve(results);
        } else {
          reject(err);
        }
      });
    });
  }

  /*
   * Validates the configuration.
   * @private
   * @return {boolean} Is valid or not.
   */
  insert(data, type, successCallback, errorCallback) {
    var query;
    var self = this;
    var originalData = data;

    /* build query */
    switch (type) {
      case "e":
        var result = this.buildEdgeQuery_(data);
        query = result.Q;
        data = result.Obj;
        break;
      case "v":
        query = this.buildVertexQuery_(data);
        break;
    }

    if (this.verbose) {
      console.log(data);
      console.log(query);
    }

    /* Execute query insert */
    this.client.execute(query, data, function (err, results) {
      if (!err) {
        successCallback(results);
      } else {
        var error = JSON.stringify(err);

        /* If it is a concurrency error due to locking, keep trying */
        if(error.indexOf('serialization') >= 0 || error.indexOf('persistence') >= 0 ){
          /* retry transaction */
          //setTimeout(function(){
          //    self.insert(originalData,type,successCallback,errorCallback);
          //},0);
        }else{
          errorCallback(err, data);
        }
      }
    });
  }

  /*
   * Construct an object to be concatenated into the gremlin-groovy query.
   * @private
   * @return {string} A new template for this object properties.
   */
  buildVertexQuery_(data) {
    /* this object */
    var self = this;
    /* Initialize template */
    var template = "";
    var count = 0;

    /* Build the template for this object */
    Object.keys(data).forEach(function (prop) {
      /* Lower case property and parameter property*/
      var loProp = S(prop).stripPunctuation().trim().underscore().s.toLowerCase();
      var objectProp = '_' + count + '_';
      count++;

      //var message = 'Property "'+loProp+'" conflicts with groovy syntax, automatically changed to: "_'+loProp+'"';
      ///* Adding to message hash */
      //if(self.messageHash[message]){
      //    self.messageHash[message]++;
      //}else{
      //    self.messageHash[message]=1;
      //}

      /* If the column is not empty */
      if (!S(data[prop]).isEmpty()) {
        /* check if it is a label */
        if (self.parser.colTypes[prop] === 'label') {

          data[objectProp] = data[prop];
          /* adding label to the template */
          template += "label, " + objectProp + ", ";
        } else {
          /* moving to new property */
          data[objectProp] = self.parseVertex_(prop, data[prop]);
          /* adding to the template */
          template += "'" + loProp + "', " + objectProp + ", ";
        }
        /* deleting old one anyways and return the iteration */
        delete data[prop];
      } else {
        /* deleting old one anyways and return the iteration */
        delete data[prop];
        return;
      }
    });

    /* Return template */
    return this.prefix + ".addV(" + template.substr(0, template.length - 2) + ")";
  }

  /*
   * Construct an object to be concatenated into the gremlin-groovy query.
   * @private
   * @return {string} A new template for this object properties.
   */
  buildEdgeQuery_(data) {
    var self = this;
    var prop, type, value;
    var objectProp;
    var finalObject = {};
    var count = 0;
    var templates = {
      sourceTemplate: "",
      targetTemplate: "",
      edgeTemplate: ""
    };
    var query;

    /* build template for source and target */
    [[data.src, "sourceTemplate"], [data.trg, "targetTemplate"]].forEach(function (tuple) {

      var arr = tuple[0];
      var localTemplate = "";

      /* building query for the has function */
      for (var i = 0; i < arr.length; i += 3) {
        /* prepare property, type, and value */
        prop = S(arr[i]).stripPunctuation().trim().underscore().s.toLowerCase();
        type = S(arr[i + 1]).stripPunctuation().trim().underscore().s.toLowerCase();
        value = arr[i + 2];

        /* If it is not an empty value */
        if (!S(value).isEmpty()) {
          /* creating the object property */
          objectProp = '_' + count + '_';
          count++;

          /* parsing the value */
          finalObject[objectProp] = self.parseEdge_(prop, type, value);
          /* build the template */
          localTemplate += "'" + prop + "', " + objectProp + ", ";
        }
      }

      /* Stripping last coma */
      templates[tuple[1]] = self.prefix + ".V().has(" + localTemplate.substr(0, localTemplate.length - 2) + ")";
    });

    /* building query for the edge, direction and label goes first */
    var direction = S(data.edge[0]).stripPunctuation().trim().underscore().s.toLowerCase();
    var label = S(data.edge[1]).trim().s;

    for (var i = 2; i < data.edge.length; i += 3) {
      /* prepare property, type, and value */
      prop = S(data.edge[i]).stripPunctuation().trim().underscore().s.toLowerCase();
      type = S(data.edge[i + 1]).stripPunctuation().trim().underscore().s.toLowerCase();
      value = data.edge[i + 2];

      /* creating the object property */
      objectProp = '_' + count + '_';
      count++;

      /* parsing the value */
      finalObject[objectProp] = self.parseEdge_(prop, type, value);
      /* build the template */
      templates.edgeTemplate += "'" + prop + "', " + objectProp + ", ";
    }

    /* Stripping last coma */
    templates.edgeTemplate = templates.edgeTemplate.substr(0, templates.edgeTemplate.length - 2);
    /* Appending separation comma if is not empty */
    templates.edgeTemplate = (S(templates.edgeTemplate).isEmpty()) ? "" : ", " + templates.edgeTemplate;

    /* build query depending on the edge direction */
    switch (direction) {
      case 'in':
        query = templates.targetTemplate + ".next().addEdge('" + label + "', " + templates.sourceTemplate + ".next()" + templates.edgeTemplate + ")";
        break;
      case 'out':
        query = templates.sourceTemplate + ".next().addEdge('" + label + "', " + templates.targetTemplate + ".next()" + templates.edgeTemplate + ")";
        break;
      default:
        throw new Error("Direction \"" + direction + "\" not supported."
              + " Supported edge directions are: in(incoming), out(outgoing)");
    }

    /* the resulting query looks similar to this:
     *
     *      g.V().has('city','Bodmin').next().addEdge('canReach',g.V().has('city','Gignod').next())
     */
    return {Q: query, Obj: finalObject};
  }

  parseVertex_(prop, value) {
    /* Extracting the column type */
    var type = this.parser.colTypes[prop];

    /* if this type is supported */
    if (!this.typeParser.hasOwnProperty(type)) {
      throw new Error("Column \"" + prop + "\" does not have a supported type: \"" + type
        + "\", supported types are: " + Object.keys(this.typeParser).join(","));
    }

    return this.typeParser[type](value);
  }

  parseEdge_(prop, type, value) {
    /* if this type is supported */
    if (!this.typeParser.hasOwnProperty(type)) {
      throw new Error("Property \"" + prop + "\" does not have a supported type: \"" + type
        + "\", supported types are: " + Object.keys(this.typeParser).join(","));
    }

    return this.typeParser[type](value);
  }
}

export default GremlinClient;
