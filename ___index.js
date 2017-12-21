const Promise = require('bluebird');
const phantom = require('phantom');
const cheerio = require('cheerio');
const fs = require('fs');
const countries = require('./countries.js').data;
var fromCountry = 0;
var toCountry = countries.length - 1;

/************************
scanned countries:
34-36, 37, 38


*************************/

var minYear = 1988;
var maxYear = 2017;

var curYear = maxYear;
var output = ['Country, Canada, Year, Trade Commodity, Unit1, Value1, Unit2, Value2'];
var n1 = toCountry - fromCountry + 1;
var n2 = maxYear - minYear + 1;

/*  name of the data table saved in the data.db sqlite database
 *  why statcan_chapter3?
 *  - statcan stands for Statistics Canada
 *  - chapter3 is the classification scheme used for all fish products
 */
var gTableName = 'statcan_chapter3';

var prog = new Progress();
var tasks = [];

getDB().then(function(obj){
  var db = obj.db;
  // for (var ct = 0; ct < countries.length; ct++) {
  for (var ct = fromCountry; ct <= toCountry; ct++) {
    for (var yr = minYear; yr <= maxYear; yr++) {
      tasks.push([db, countries[ct], yr]);
    }
  }

  Promise.map(
    tasks,
    function(e){ return scrape.apply(this, e); },
    {concurrency: 5}
  )
  .then(function(){
    console.log('Job done!');

    // close database connection
    db.close();
  })
  .catch(error => {
    console.log(error);
  });
}) // end getDB().then
.catch(error => {
  console.log(error);
});

function scrape(db, country, year) {
  return new Promise(function(resolve, reject){
    var url = `http://www5.statcan.gc.ca/cimt-cicm/topNCommodity-marchandise?lang=eng&getSectionId()=0&dataTransformation=0&scaleValue=0&scaleQuantity=0&refYr=${year}&refMonth=10&freq=12&countryId=${country.id}&getUsaState()=0&provId=1&retrieve=Retrieve&country=null&tradeType=1&topNDefault=250&monthStr=null&chapterId=3&arrayId=9800003`;

    var phInstance = null;
    var sitePage = null;
    var log = console.log;
    var nolog = function() {};
    phantom.create([], { logger: { warn: nolog, debug: nolog, error: log } })
      .then(instance => {
        phInstance = instance;
        return instance.createPage();
      })
      .then(page => {
        sitePage = page;
        var abort = {};
        abort[(country.id).toString() + (year).toString()] = 0;
        // page.setting('userAgent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:22.0) Gecko/20100101 Firefox/22.0');
        page.setting('loadImages', false);
        page.setting('resourceTimeout', 1900);

        page.property('onResourceRequested', function(requestData, request){
          if(abort[(country.id).toString() + (year).toString()]){
            request.abort();
            return;
          }
        });

        var intervals = [];

        function doWork(){
          page.open(url) // this event will be triggered intermittently but can't guarantee to get valid data
            .then(function(){
              // console.log(`page open: ${country.value} ${year}`);
              _scrape(sitePage, country, year, function(data){
                var id = (country.id).toString() + (year).toString();
                if(!abort[id]){ // first hit
                  phInstance.exit();
                  var p = prog.set();
				  var msg = `Processing ${country.value} ${year}: ${data.length} rows ${p}% ...`;
                  console.log(msg);
				  fs.appendFile('info.log', msg + '\r\n', (err) => {
					  if (err) throw err;
					});
                  abort[id] = 1;
                  for (var i = 0; i < intervals.length; i++) {
                    clearInterval(intervals[i]);
                  }

                  // insert to db
                  if(data.length){
                    sql = `INSERT INTO ${gTableName} VALUES `;
                    for (var i = 0; i < data.length; i++) {
                      if(i) sql +=',';
                      sql += data[i];
                    }
                    // console.log(sql);
                    insertDB(db, sql)
                      .then(function(obj){
                        // console.log(obj.message);
                        resolve({ status: true });
                      });
                  }else{ // no records, no need to update db
                    return resolve({ status: true });
                  }

                }else{ // other scanners after the first hit
                  return;
                }
              });
          }) // end page.open.then
          .catch(error => {
            // this catch is to ignore 'Error: Phantom process stopped with exit code 0'
            return resolve({ status: true });
          });
        } // end doWork

        doWork();
        intervals.push(setInterval(function(){ doWork(); }, 2000));

      }); // end phantom.create.then.then
  }); // end new Promise
} // end function scrape

function pad(num, size) {
    var s = num + "";
    while (s.length < size) s = " " + s;
    return s;
}

function Progress(isSet){
  var i = 0, n = n1*n2;
  function _p(){ return pad((i * 100 / n).toFixed(2), 6); };
  return {
    set: function(){ i++; return _p(); },
    get: function(){ return _p(); }
  }
}

function getDB(tableName){
  return new Promise(function(resolve, reject){
    tableName = tableName || gTableName;
    const sqlite3 = require('sqlite3').verbose();
    let db = new sqlite3.Database('./data.db', (err) => {
      if (err) {
        // console.log('Connected to the SQlite database.\n' + err.message);
        reject( {status: false, message: err.message} );
        // return { status: false, message: err.message };
      }
    });

    sql = `SELECT count(*) as n FROM sqlite_master WHERE type='table' AND name='${tableName}';`;

    db.get(sql, [], (err, row) => {
      if(!row.n){
        sql = `CREATE TABLE ${tableName} (country TEXT, canada TEXT, year INTEGER, commodity TEXT, unit1 TEXT, value1 INTEGER, unit2 TEXT, value2 INTEGER)`;
        db.get(sql, [], (err, row) => {
          if(err){
            // console.log('Failed to create table!\n' + err.message);
            reject({ status: false, message: err.message });
            // return { status: false, message: err.message };
          }
          // console.log('table created');
          resolve({ db: db, status: true, message: 'Table Created' });
          // return { db: db, status: true, message: 'Table Created' };
        });
      }else{
        // console.log('table exists');
        resolve({ db: db, status: true, message: 'Table Exists' });
        // return { db: db, status: true, message: 'Table Exists' };
      }
    });
  });
}

function insertDB(db, sql){
  return new Promise(function(resolve, reject){
    db.get(sql, [], (err, row) => {
      if(err){
        // console.log(err.message);
        reject({ status: false, message: err.message });
      }
      resolve({ status: true, message: '\trecords inserted to database.' });
      // console.log('\trecords inserted.');
    });
  });
}

// scan the request webpage's content
function _scrape(sitePage, country, year, cb){
  sitePage.property('content')
    .then(function(content){
      // console.log(`processing ${year}`);
      var $ = cheerio.load(content);
      var challenge = $('body[onload="challenge()"]');
      // var frag = $('#wb-cont');
      var dataPage = $('p.Cent a[href="/cimt-cicm/home-accueil?lang=eng"]');
      var dataPageNA = $('.color-attention');
      var dataPageTable = $('table.CIMT');

      if(challenge.length){
        // console.log(`challenge year: ${year}`);
        return;
      }

      if(!dataPage.length){
        // console.log(`page [${year}] not completely loaded!`);
        return;
      }

      if(dataPageNA.length){
        // console.log('empty data records');
        return cb([]);
      }else if(dataPageTable.length){
        var headRows = dataPageTable.find('thead tr');
        var currency = $(headRows[1])
          .find('abbr')
          .map(function(i,e){return $(e).text().trim()})[0]; // unit of currency
        var rows = dataPageTable.find('.ResultRow');
        var data = [];
        for (var j = 0; j < rows.length; j++) {
          var cols = $(rows[j]).children();
          var commodity = $(cols[1]).text().replace(/\s+/g, ' ').trim();
          var unit1 = $(cols[2]).text().trim(); // unit of weight
          var value1 = $(cols[3]).text().replace(/,/g,'').trim(); // weight
          var value2 = $(cols[4]).text().replace(/,/g,'').trim(); // revenue
          data.push(`('${country.value}', 'Canada', ${year}, '${commodity}', '${unit1}', ${value1}, '${currency}', ${value2})`);
        }
        return cb(data);
      }else{
        console.log('**** bug *****');
      }
    }) // end then
    .catch(error => {
      // console.log(error);
      // this catch is to ignore 'Error: Phantom process stopped with exit code 0'
      return;
    });
} // end function _scrape
