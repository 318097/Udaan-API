const express = require('express');
const bodyParser = require('body-parser');
const MongoClient = require('mongodb').MongoClient
let mDb;

// The mongodb can be accessed from either mLab or run locally
// Use the below url to access mongoDb on mLab
// let dbUrl = 'mongodb://root:root12345@ds119524.mlab.com:19524/udaan';

// Use the url to connect locally
let dbUrl = 'mongodb://localhost:27017/udaan';

MongoClient.connect(dbUrl, function (err, db) {
    if (err) throw err

    console.log('Connected to MongoDb.');
    mDb = db;
});
const app = express();
// The port on which the express server is run.
const port = 9090;

/* Middlewares */
// Add headers
app.use(function (req, res, next) {
    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', true);
    // Pass to next layer of middleware
    next();
});

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))
// parse application/json
app.use(bodyParser.json())

/* Routes */
app.get('/', (req, res) => {
    res.send('Udaan Hiring Challenge..');
});

// Add screen info
app.post('/screens', (req, res) => {
    // console.log(req.body);
    let data = req.body;
    for (let row in data.seatInfo) {
        if (data.seatInfo.hasOwnProperty(row)) {
            let available = [];
            for (let i = 0; i < data.seatInfo[row]['numberOfSeats']; i++) {
                available.push(i);
            }
            // initialize the available property to the default seat nos ranging from 0 - numberOfSeats
            data.seatInfo[row]['available'] = available;
            // initialize the reserved seats property to empty array
            data.seatInfo[row]['reserved'] = [];
        }
    }
    mDb.collection("movies").insert(data, (er, result) => {
        if (er) throw er;

        // console.log(result);
        res.send({ "status": 200, "message": "Successfully inserted data." });
    });
});

// Get all screens info
app.get('/screens', (req, res) => {
    mDb.collection("movies").find({}).toArray((er, result) => {
        if (er) throw er;

        // console.log(result);
        res.send({ "status": 200, "message": "Successfully fetched data.", "data": result });
    });
});

// Reserve seats for a given screen
app.post('/screens/:screenName/reserve', (req, res) => {
    let data = req.body;
    let screenName = req.params.screenName;
    console.log('Requested seats ::', data);
    mDb.collection("movies").findOne({ name: screenName }, (er, r) => {
        if (er) throw er;

        let requestedSeats = data.seats;
        let status = true; // flag to indicate whether there is availability of the requested seats. initially it is true.
        let obj = {};
        for (var key in requestedSeats) {
            // if the requested row is present in the screen info.
            if (
                requestedSeats.hasOwnProperty(key) &&
                r['seatInfo'].hasOwnProperty(key)
            ) {
                const reservedKey = 'seatInfo.' + key + '.reserved';
                const availableKey = 'seatInfo.' + key + '.available';
                // forming the new reserved seats by concatenating the old seats with the newly requested seats.
                let reservedSeats = r.seatInfo[key]['reserved'];
                let availableSeats = r.seatInfo[key]['available'];

                // Check every seat for that particular row
                requestedSeats[key].forEach(seatNo => {
                    if (r.seatInfo[key]['reserved'] && r.seatInfo[key]['reserved'].includes(seatNo)) {
                        // there is no availability , if the requested seat no is already present in the reserved.
                        status = false;
                    } else {
                        // remove the reserved seats from the list of available seats.
                        if (availableSeats.includes(seatNo)) {
                            availableSeats.splice(availableSeats.indexOf(seatNo), 1);
                            reservedSeats.push(seatNo);
                        }
                    }
                });
                obj[reservedKey] = reservedSeats;
                obj[availableKey] = availableSeats;
            }
        }
        if (status) {
            // console.log('seats available');
            console.log('object to update ::', obj);

            // update the database only if the requested seats were available
            mDb.collection('movies').update(
                { name: screenName },
                { $set: obj }
            );
            res.send({ "status": 200, "message": "The requested seats were booked." });
        } else {
            console.log('seats not available');
            res.send({ "status": 400, "message": "The requested seats are not available." });
        }
    });
});

// Get Available seats for a given screen
app.get('/screens/:screenName/seats', (req, res) => {
    let data = req.body;
    let screenName = req.params.screenName;

    mDb.collection("movies").findOne({ name: screenName }, (er, result) => {
        if (er) throw er;
        // console.log(req.query);
        if (req.query.status) { // returns the status of the screen
            let searchProperty = req.query.status === 'unreserved' ? 'available' : 'reserved';

            let responseData = {};
            let seats = {};

            // look for the requsted status, and returns
            for (let row in result.seatInfo) {
                if (result.seatInfo.hasOwnProperty(row)) {
                    seats[row] = result.seatInfo[row][searchProperty];
                }
            }
            responseData['seats'] = seats;
            res.send({ "status": 200, "message": "Successfully fetched data.", data: responseData });
        } else if (req.query.numSeats && req.query.choice) { // returns the optimal seats as per the request
            const [rowNo, seatNo] = req.query.choice.split("");
            const numSeats = req.query.numSeats;
            const rowStatus = result.seatInfo[rowNo]; // extract the info about the row
            let foundOptimalSeats = false; // status of the request
            if (rowStatus) {
                let startIndex = seatNo - numSeats + 1;

                // find the starting index for the search, i.e., find the seat no from where to start the search
                while (startIndex < 0 || startIndex > rowStatus.numberOfSeats - 1) {
                    if (startIndex < 0) {
                        startIndex++;
                    } else if (startIndex > rowStatus.numberOfSeats) {
                        startIndex--;
                    }
                }
                console.log('start index', startIndex);
                let seats;
                for (let j = startIndex; j < startIndex + numSeats; j++) {
                    let count = 0;
                    seats = [];
                    let index = j;
                    while (count != numSeats) {
                        if (rowStatus.available.includes(index)) { // find the continous seat range, including the mentioned seat no
                            if (startIndex)
                                seats.push(index);
                            count++;
                        } else {
                            break;
                        }
                        index++;
                    }
                    if (count == numSeats) {
                        let isContinous = true;
                        let check = seats.slice();
                        check.pop();
                        check.shift();
                        // check for aisle seats except for the first & last seat of the range.
                        for (let x = 0; x < check.length; x++) {
                            if (rowStatus.aisleSeats.includes(check[x])) {
                                // if there is any aisle seat in the middle, then continue finding seats.
                                // because there cannot be seats with a gap.
                                isContinous = false;
                                break;
                            }
                        }
                        if (isContinous) {
                            // seats are found only if the mentioned seat no is present in the range & there is no gap in between
                            foundOptimalSeats = true;
                            break;
                        }
                    }
                }
                console.log(rowStatus);
                let responseData = {};
                responseData['availableSeats'] = {};
                responseData['availableSeats'][rowNo] = seats.length > 0 ? seats : 'No continous seats found.';
                res.send({ "status": 200, "message": "Successfully fetched data.", data: responseData });
            }
        }
    });
});

app.listen(port, () => console.log(`Server started on port ${port}...`));