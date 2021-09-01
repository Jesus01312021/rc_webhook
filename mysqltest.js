// Import mysql module
let mysql = require('mysql');

// Setup database connection parameter
let connection = mysql.createConnection({

 host: "162.214.147.125",
    database: "ringcentral",
    user: "ringcentral",
    password: "Letmein2021-",
    port: '3306',
});

// Connect with the database
connection.connect(function(e) {
if (e) {

// Show error messaage on failure
return console.error('error: ' + e.message);
}

// Show success message if connected
console.log('\nConnected to the MySQL server...\n');
});

// Set the query message
$query = 'SELECT * from ringcentral.rc_csn';

// Execute the database query
connection.query($query, function(e, rows) {
if(e){

// Show the error message
console.log("Error ocurred in executing the query.");
return;
}})
/* Display the formatted data retrieved from 'book' table
// using for loop */
// console.log("The records of book table:\n");
// console.log("Title\t\t\t\t Author\t\tprice\n");
// for(let row of rows) {
//   console.log(row['title'],"\t\t",row['author'],"\t","$",row['price']);
// }
// });

// // Close the database connection
// connection.end(function(){
// console.log('\nConnection closed.\n');
// });