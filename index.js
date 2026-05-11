const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const session = require('express-session');
const Joi = require('joi');
const bcrypt = require('bcrypt');
const app = express();

const { MongoStore } = require('connect-mongo');
const mongoSanitizer = require('mongo-sanitizer').default;
const { MongoClient } = require('mongodb');
const { createKrupteinAdapter } = require('connect-mongo');
const { name } = require('ejs');


// --- MongoDB Connection Logic ---
const url = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}`;
const client = new MongoClient(url);

// prevent the NoSql injection attacks
app.use(mongoSanitizer(
    { replaceWith: '_' }
));

let db;
let usersCollection;

async function connectDB() {
    try {
        await client.connect();
        console.log("Connected successfully to MongoDB");

        db = client.db(process.env.MONGODB_DATABASE);
        usersCollection = db.collection('users');
    } catch (err) {
        console.error("MongoDB connection failed:", err);
    }
}


// Getting userdata from the browser in the Joi format so that there is noSQL injection 
const signUpSchema = Joi.object({
    name: Joi.string().alphanum().min(3).max(30).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required()
});

const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required() // We don't need min(8) here, just check if it's provided
});

// 
const updateUserRole = Joi.object({
    userName: Joi.string().alphanum().min(3).max(30).required(),
    isPromote: Joi.bool().required()
});


app.use(session({
    secret: process.env.NODE_SESSION_SECRET,
    // to store the session in the mongo
    store: MongoStore.create({
        mongoUrl: `${url}/${process.env.MONGODB_SESSION_DATABASE}`,
        cryptoAdapter: createKrupteinAdapter({
            secret: process.env.MONGODB_SESSION_SECRET
        }),
        ttl: 60 * 60
    }), // stores the session in the db
    saveUninitialized: false,
    resave: false,
}
));

// Middleware to parse URL-encoded bodies (as sent by HTML forms)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// Serve static files so the UI can actually load the image via URL
app.use(express.static('public'));

// Set EJS as the view engine
app.set('view engine', 'ejs');

app.get('/', (req, res) => {
    let userName = req.session.userName;
    let page = "home";
    res.render('index', { userName, page });
});

app.get('/members', (req, res) => {
    let userName = req.session.userName;
    let page = "members";
    if (!userName) {
        // if no session, redirect to Home
        return res.redirect("/");
    }
    const publicPath = path.join(__dirname, 'public/images');
    fs.readdir(publicPath, (err, imageFiles) => {
        if (err || imageFiles.length === 0) {
            console.log('No images found', err);
            return res.status(500).send("No images available");
        }

        // Send the URL or the filename back to the UI
        res.render('members', { userName, imageFiles, page });
    });

});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

app.get('/signup', (req, res) => {
    let page = "signup";
    res.render('signup', { page });
});

app.post('/signupSubmit', async (req, res) => {
    console.log(req.body);

    const validationRes = signUpSchema.validate(req.body);
    // console.log(validationRes);

    // removed the if conditions did for each req.body.{field}, since joi schema validation is included in the code
    if (validationRes.error) {
        res.status(400).send(
            `
        <p>${validationRes.error}.</p>
        <a href ="/signup"> Try again</a>
        `
        );
    } else {

        // let name = validationRes.value.name;
        // let email = validationRes.value.email;
        // let password = validationRes.value.password;

        // Destructuring: https://www.w3schools.com/js/js_destructuring.asp
        const { name, email, password } = validationRes.value;
        let isAdmin;
        if (email === process.env.DEFAULT_SITE_ADMIN) {
            isAdmin = true;
        } else {
            isAdmin = false;
        }

        // 1.add in database
        try {
            // 1a. check if the user already exists in the Db
            // const existingUser = await User.findOne({email});
            // if (existingUser) return res.status(404).send('User already registered.');

            //1b. hash the password
            const saltRounds = 12;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            //1c. get users database
            const users = db.collection('users');

            // save to MongoDb
            const result = await usersCollection.insertOne({
                name,
                email,
                password: hashedPassword,
                isAdmin
            });
            console.log('User registered Successfully!', result);
            // 2.session - set user
            req.session.userName = name;
            // 2.a Set isAdmin flag in Session
            req.session.isAdmin = isAdmin;
            // 3.redirect
            res.redirect("/members");
        } catch (err) {
            console.error(err);
            res.send("Error registering user!");
        }
    }
});

app.get('/login', (req, res) => {
    let page = "login";
    res.render('login', { page });
});

app.post('/loginSubmit', async (req, res) => {
    console.log(req.body);

    const validationRes = loginSchema.validate(req.body);
    // console.log(validationRes);

    // removed the if conditions did for each req.body.{field}, since joi schema validation is included in the code
    if (validationRes.error) {
        res.status(400).send(
            `
        <p>${validationRes.error}.</p>
        <a href ="/signup"> Try again</a>
        `
        );
    } else {

        // let name = validationRes.value.name;
        // let email = validationRes.value.email;
        // let password = validationRes.value.password;

        // Destructuring: https://www.w3schools.com/js/js_destructuring.asp
        const { email, password } = validationRes.value;

        try {

            //1 Check if user is in the database
            const user = await usersCollection.findOne({ email });

            if (user) {
                // 2. Compare the password with the hashed password in DB
                // Use compare method to compare the hashed password with plain one (comes in post request)
                const validPassword = await bcrypt.compare(password, user.password);
                console.log(validPassword);
                if (!validPassword) {
                    return res.status(400).send('Invalid email or password.');
                }
                // 3.session - set user
                req.session.userName = user.name;

                // if (user.isAdmin != undefined) {
                //     req.session.isAdmin = user.isAdmin;
                // } else {
                //     req.session.isAdmin = false; // default
                // }
                // const b = user.isAdmin != undefined ? true : false;
                // const b = user.isAdmin != undefined;

                // const b = user?.isAdmin;
                req.session.isAdmin = user.isAdmin ? true : false; // ternary operator
                return res.redirect("/members");
            } else {
                res.send(`
                    <p>User not found.</p>
                    <a href ="/signup"> Try Sign up again</a>
                    `);
            }
        } catch (err) {
            console.error(err);
            res.send("Error processing login!");
        }
    }
});

// const users = [{
//     name: "Varshini",
//     email: "varshini@gmail.com",
//     role: "user"
// }, {
//     name: "Krish",
//     email: "krish@gmail.com",
//     role: "admin"
// }, {
//     name: "Nava",
//     email: "nava@gmail.com",
//     role: "user"
// }, {
//     name: "Sundari",
//     email: "sundari@gmail.com",
//     role: "user"
// }, {
//     name: "Babu",
//     email: "babu@gmail.com",
//     role: "user"
// }, {
//     name: "Kaushikh",
//     email: "kaushikh@gmail.com",
//     role: "admin"
// }, {
//     name: "Surriya",
//     email: "surriya@gmail.com",
//     role: "admin"
// }, {
//     name: "Swetha",
//     email: "swetha@gmail.com",
//     role: "user"
// }, {
//     name: " Surya",
//     email: "Surya@gmail.com",
//     role: "admin"
// }, {
//     name: "Abu",
//     email: "abu@gmail.com",
//     role: "admin"
// }];

app.get('/admin', async (req, res) => {
    try {
        // Check if the user is Authenticated
        if (!req.session.userName) {
            return res.redirect("/");
        }
        // Check if the user is Authorized
        if (req.session.isAdmin) {
            // 1 Get users from database
            const users = await usersCollection.find({}).toArray();
            return res.render('admin', { users, page: "admin" });
        } else {
            return res.status(403).send("403 - Not Authorized");
        }
    } catch (err) {
        console.log(err);
    }
});

app.patch('/user/role', async (req, res) => {
    try {
        // check if authenticated
        if (!req.session.userName) {
            return res.redirect("/");
        }
        // Check if authorized as Admin
        if (req.session.isAdmin) {
            // Get the user who need to be made admin from form
            const { userName, isPromote } = updateUserRole.validate(req.body).value;
            // Get users from database
            const updateRes = await usersCollection.updateOne(
                { name: userName },
                { $set: { isAdmin: isPromote } },
            );
            if (updateRes.matchedCount <= 0) {
                return res.status(404).send("User not found");
            } else {
                return res.status(200).send("Updated successfullty");
            }
        } else {
            return res.status(403).send("403 - Not Authorized");
        }
    } catch (err) {
        console.log(err);
    }
});


app.use((req, res) => {
    res.status(404);
    let page = "404";
    res.render('404', { page: "404" });
});

const PORT = 3000;

app.listen(PORT, async () => {
    connectDB();
    console.log(`Listening on ${PORT}`);
})

