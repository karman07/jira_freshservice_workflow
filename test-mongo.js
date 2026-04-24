  const mongoose = require('mongoose');

  async function run() {
    await mongoose.connect('mongodb+srv://karmansingharora03_db_user:8813917626$Karman@cluster0.ecbazzx.mongodb.net/');
    const customer = await mongoose.connection.collection('customers').findOne({ slug: "staylor-corpus" });
    if (!customer) {
        console.log("Customer not found.");
    } else {
        console.log('jiraBaseUrl:', customer.jiraBaseUrl);
        console.log('jiraEmail:', customer.jiraEmail);
        console.log('jiraApiToken:', customer.jiraApiToken);
        console.log('jiraProjectKey:', customer.jiraProjectKey);
    }
    process.exit(0);
  }
  run();
