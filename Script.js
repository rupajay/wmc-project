import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
const SECRET_KEY = 'myauthencation';
import session from 'express-session';

// const pgSession = connectPgSimple(session);

const app = express();
const port = 3000;

app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({ extended: true }));
const upload = multer({ dest: 'uploads/' });
app.use(express.static("public"));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: true }
}))

// Middleware to get the logged-in user
const getUser = async (req, res, next) => {
  const userEmail = req.cookies.userEmail;
  if (userEmail) {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [userEmail]);
    if (result.rows.length > 0) {
      req.user = result.rows[0];
    }
  }
  next();
};

app.use(getUser);

const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    database: "WMC_LOGIN",
    password: "jayrupareliya",
    port: 5432,
  });

  // app.use(session({
  //   store: new pgSession({
  //     pgPromise: db, // Connection pool
  //   }),
  //   secret: 'your_secret_key',
  //   resave: false,
  //   saveUninitialized: false,
  //   cookie: { maxAge: 60 * 60 * 1000 } // 1 hour
  // }));


db.connect();


cloudinary.config({ 
    cloud_name: 'dkhzguzox', 
    api_key: '714236652896573', 
    api_secret: 'QVw6U1c399-w5h4Ro57cjRIu-c0' // Click 'View Credentials' below to copy your API secret
});

// =======================================================

app.get('/', (req, res) => {
  const userEmail = req.cookies.userEmail || null;
  res.render('Home_page.ejs', { userEmail: userEmail });
});


// Registration endpoint
app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await db.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING *',
      [username, email, hashedPassword]
    );
    
    res.redirect("/");
  } catch (error) {
    if (error.code === '23505') {
      res.status(400).json({ message: 'Username or email already exists' });
    } else {
      res.status(500).json({ message: 'Internal server error', error });
    }
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    res.cookie('userEmail', user.email.toString(), { maxAge: 900000, httpOnly: true });

    res.redirect("/");
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error });
  }
});

app.get('/profile', async (req, res) => {
  const userEmail = req.cookies.userEmail;

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [userEmail]);

    if (result.rows.length === 0) {
      return res.redirect('/login');
    }

    const user = result.rows[0];

    const x1 = (await db.query('SELECT * FROM purchase_history WHERE buyer_email = $1', [userEmail])).rows;
    console.log(x1);
    
    res.render('PROFILE.ejs', { 
      user, 
      x1
    });

  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error });
  }
});

app.post('/logout', (req, res) => {
  res.clearCookie('userEmail');
  res.redirect('/');
});

// Add Money endpoint
app.post('/add-money', async (req, res) => {
  const userEmail = req.cookies.userEmail;
  const { amount } = req.body;

  if (!userEmail || !amount || amount <= 0) {
    return res.status(400).json({ message: 'Invalid request' });
  }

  try {
    const result = await db.query(
      'UPDATE users SET balance = balance + $1 WHERE email = $2 RETURNING *',
      [amount, userEmail]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'Money added successfully', newBalance: result.rows[0].balance });
  } catch (error) {
    console.error(error); // Highlighted line to log error
    res.status(500).json({ message: 'Internal server error', error });
  }
});

// Withdraw Money endpoint
app.post('/withdraw-money', async (req, res) => {
  const userEmail = req.cookies.userEmail;
  const { amount } = req.body;

  if (!userEmail || !amount || amount <= 0) {
    return res.status(400).json({ message: 'Invalid request' });
  }

  try {
    const result = await db.query('SELECT balance FROM users WHERE email = $1', [userEmail]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentBalance = result.rows[0].balance;
    
    if (currentBalance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    if (currentBalance <= 0) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    const updatedResult = await db.query(
      'UPDATE users SET balance = balance - $1 WHERE email = $2 RETURNING *',
      [amount, userEmail]
    );

    res.json({ message: 'Money withdrawn successfully', newBalance: updatedResult.rows[0].balance });
  } catch (error) {
    console.error(error); // Highlighted line to log error
    res.status(500).json({ message: 'Internal server error', error });
  }
});

// =================================================


async function uploadFileToCloudinary(file, folder, quality) {
    const options = { folder };
    options.resource_type = 'auto';
  
    if (quality) {
      options.quality = quality;
    }
  
    return await cloudinary.uploader.upload(file.path, options);
  }

const imageUpload = async (req, res) => {
    try {
      const file = req.file;
      const response = await uploadFileToCloudinary(file, 'cars');
  
      res.status(200).json({
        success: true,
        image_url: response.secure_url,
        message: 'Image successfully uploaded',
      });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        success: false,
        message: 'Something went wrong in image upload via Cloudinary',
      });
    }
  };


//   app.post('/api/update-profile', upload.single('photo'), async (req, res) => {
//     try {
//         const { userId } = req.body;
//         const file = req.file;

//         if (!file) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'No file uploaded',
//             });
//         }

//         const response = await uploadFileToCloudinary(file, 'profiles');
//         const imageUrl = response.secure_url;

//         const query = `
//             UPDATE users
//             SET profile_picture = $1
//             WHERE id = $2
//             RETURNING *;
//         `;

//         const values = [imageUrl, userId];

//         const result = await db.query(query, values);

//         res.status(200).json({
//             success: true,
//             data: result.rows[0],
//             message: 'Profile picture successfully updated',
//         });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({
//             success: false,
//             message: 'Error updating profile picture',
//         });
//     }
// });

app.post('/api/profile-pic', upload.array('photos', 10), async (req, res) => {
  try {
    const userId = req.body.id; // Assuming the user ID is sent in the body
    const files = req.files;
    const imageUrls = [];

    for (const file of files) {
      const response = await uploadFileToCloudinary(file, 'profile-pic');
      imageUrls.push(response.secure_url);
    }

    const query = `
      UPDATE users
      SET profile_picture = $1
      WHERE id = $2
      RETURNING *;
    `;

    const values = [imageUrls.join(','), userId];

    const result = await db.query(query, values);

    // res.status(200).json({
    //   success: true,
    //   data: result.rows[0],
    //   message: 'Profile picture successfully updated',
    // });
    res.redirect('/');
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile picture',
    });
  }
});



app.post('/api/sell-car', upload.array('photos', 10), async (req, res) => {
    try {
      const {
        model,
        year,
        price,
        mileage,
        HP,
        speed,
        transmission,
        fuel,
        description,
        sellerName,
        sellerEmail,
        sellerPhone,
      } = req.body;
  
      const files = req.files;
      const imageUrls = [];
  
      for (const file of files) {
        const response = await uploadFileToCloudinary(file, 'cars');
        imageUrls.push(response.secure_url);
      }
  
      const query = `
        INSERT INTO buy_car2 (model, image, price, description, power, milage, transmission, speed, year, fuel, relator, email, phone)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *;
      `;
  
      const values = [
        model,
        imageUrls.join(','), // Store image URLs as comma-separated values
        price,
        description,
        HP,
        mileage,
        transmission,
        speed,
        year,
        fuel,
        sellerName,
        sellerEmail,
        sellerPhone,
      ];
  
      const result = await db.query(query, values);
      res.redirect("/buy/car");
      // res.status(200).json({
      //   success: true,
      //   data: result.rows[0],
      //   message: 'Car data successfully saved',
      // });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: 'Error saving car data',
      });
    }
  });

app.post('/api/sell-plane', upload.array('photos', 10), async (req, res) => {
    try {
        const {
            model,
            year,
            price,
            range,
            thrust,
            speed,
            capacity,
            type,
            description,
            sellerName,
            sellerEmail,
            sellerPhone,
        } = req.body;

        const files = req.files;
        const imageUrls = [];

        for (const file of files) {
            const response = await uploadFileToCloudinary(file, 'planes');
            imageUrls.push(response.secure_url);
        }

        const query = `
            INSERT INTO buy_planes2 (model, year, price, range, thrust, speed, capacity, type, description, seller_name, seller_email, seller_phone, photos)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *;
        `;

        const values = [
            model,
            year,
            price,
            range,
            thrust,
            speed,
            capacity,
            type,
            description,
            sellerName,
            sellerEmail,
            sellerPhone,
            imageUrls.join(','), // Store image URLs as comma-separated values
        ];

        const result = await db.query(query, values);

      res.redirect("/buy/plan");

        // res.status(200).json({
        //     success: true,
        //     data: result.rows[0],
        //     message: 'Plane data successfully saved',
        // });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error saving plane data',
        });
    }
});

app.post('/api/sell-penthouse', upload.array('photos', 10), async (req, res) => {
    try {
      const {
        name,
        year,
        price,
        bed,
        level,
        sqft,
        bathroom,
        location,
        description,
        sellerName,
        sellerEmail,
        sellerPhone,
      } = req.body;
  
      const files = req.files;
      const imageUrls = [];
  
      for (const file of files) {
        const response = await uploadFileToCloudinary(file, 'penthouse');
        imageUrls.push(response.secure_url);
      }
  
      const query = `
        INSERT INTO buy_penthouses2 (name, year, price, bed, level, sqft, bathroom, location, description, seller_name, seller_email, seller_phone, photos)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *;
      `;
  
      const values = [
        name,
        year,
        price,
        bed,
        level,
        sqft,
        bathroom,
        location,
        description,
        sellerName,
        sellerEmail,
        sellerPhone,
        imageUrls.join(','), // Store image URLs as comma-separated values
      ];
  
      const result = await db.query(query, values);
  
      res.redirect("/buy/penthouse");
      // res.status(200).json({
      //   success: true,
      //   data: result.rows[0],
      //   message: 'Penthouse data successfully saved',
      // });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: 'Error saving penthouse data',
      });
    }
  });

app.post('/api/sell-yatch', upload.array('photos', 10), async (req, res) => {
    try {
      const {
        name,
        year,
        price,
        length,
        power,
        speed,
        cabin,
        type,
        description,
        sellerName,
        sellerEmail,
        sellerPhone,
      } = req.body;
  
      const files = req.files;
      const imageUrls = [];
  
      for (const file of files) {
        const response = await uploadFileToCloudinary(file, 'yatch');
        imageUrls.push(response.secure_url);
      }
  
      const query = `
        INSERT INTO buy_yatch2 (name, year, price, length, power, speed, cabin, type, description, seller_name, seller_email, seller_phone, photos)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *;
      `;
  
      const values = [
        name,
        year,
        price,
        length,
        power,
        speed,
        cabin,
        type,
        description,
        sellerName,
        sellerEmail,
        sellerPhone,
        imageUrls.join(','), // Store image URLs as comma-separated values
      ];
  
      const result = await db.query(query, values);
      
      res.redirect("/buy/yatch");

      // res.status(200).json({
      //   success: true,
      //   data: result.rows[0],
      //   message: 'Yatch data successfully saved',
      // });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: 'Error saving Yatch data',
      });
    }
  });


// ==============================================

async function checkavailablecar(){
    const result = await db.query("SELECT id, model, price, image, year, milage, speed, power, fuel from buy_car2");
    return result.rows;
}

async function checkavailableplan(){
  const result = await db.query("SELECT id, model, year, price, range, thrust, speed, capacity, type, description, seller_name, seller_email, seller_phone, photos from buy_planes2");
  return result.rows;
}

async function checkavailablepenthouse(){
  const result = await db.query("SELECT id, name, year, price, bed, level, sqft, bathroom, location, description, seller_name, seller_email, seller_phone, photos from buy_penthouses2");
  return result.rows;
}

async function checkavailableyatch(){
  const result = await db.query("SELECT id, name, year, price, length, power, speed, cabin, type, description, seller_name, seller_email, seller_phone, photos from buy_yatch2");
  return result.rows;
}

// app.get("/buy/car", async (req, res) => {
//   const cars = await checkavailablecar();
//   res.render("BUY_CAR.ejs", {
//       cars: cars
//   });
// });

app.get("/buy/car", async (req, res) => {
  const { price, fuel, year, transmission } = req.query;
  const userEmail = req.cookies.userEmail;

  if(!userEmail){
    return res.redirect('/')
  }
  

  let query = "SELECT id, model, price, image, year, milage, speed, power, fuel FROM buy_car2 WHERE 1=1";
  let values = [];

  if (price) {
    let [minPrice, maxPrice] = price.split('-').map(Number);
    if (minPrice != null && maxPrice != null) {
      query += ` AND price BETWEEN $${values.length + 1} AND $${values.length + 2}`;
      values.push(minPrice, maxPrice);
    }
  }

  if (fuel) {
    query += ` AND fuel = $${values.length + 1}`;
    values.push(fuel);
  }

  if (year) {
    query += ` AND year = $${values.length + 1}`;
    values.push(Number(year));
  }

  if (transmission) {
    query += ` AND transmission = $${values.length + 1}`;
    values.push(transmission);
  }

  try {
    const result = await db.query(query, values);
    res.render("BUY_CAR.ejs", {
      cars: result.rows,
      message: null  // Ensure message is always defined
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching car data");
  }
});

app.get('/check-login', (req, res) => {
  const userEmail = req.cookies.userEmail;
  res.json({ loggedIn: !!userEmail });
});




// app.get("/buy/plan", async (req, res) => {
//     const planes = await checkavailableplan();
//     res.render("BUY_PLAN.ejs", {
//         planes: planes
//     });
// });

app.get("/buy/plan", async (req, res) => {
  const { price, capacity, year, type } = req.query;
  const userEmail = req.cookies.userEmail;

  if(!userEmail){
    return res.redirect('/')
  }

  // Build the query dynamically based on filters
  let query = "SELECT id, model, year, price, range, thrust, speed, capacity, type, photos FROM buy_planes2 WHERE 1=1";
  let values = [];

  if (price) {
    let [minPrice, maxPrice] = price.split('-').map(Number);
    if (minPrice != null && maxPrice != null) {
      query += ` AND price BETWEEN $${values.length + 1} AND $${values.length + 2}`;
      values.push(minPrice, maxPrice);
    }
  }

  // if (capacity) {
  //   query += ` AND capacity = $${values.length + 1}`;
  //   values.push(Number(capacity));
  // }

  if (capacity) {
    let [minCapacity, maxCapacity] = capacity.split('-').map(Number);
    if (minCapacity != null && maxCapacity != null) {
      query += ` AND capacity BETWEEN $${values.length + 1} AND $${values.length + 2}`;
      values.push(minCapacity, maxCapacity);
    }
  }

  if (year) {
    query += ` AND year = $${values.length + 1}`;
    values.push(Number(year));
  }

  if (type) {
    query += ` AND type = $${values.length + 1}`;
    values.push(type);
  }

  // if (features) {
  //   Assuming features are stored as a comma-separated string in the database
  //   query += ` AND features LIKE $${values.length + 1}`;
  //   values.push(`%${features}%`);
  // }

  try {
    const result = await db.query(query, values);
    res.render("BUY_PLAN.ejs", {
      planes: result.rows,
      message: null
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching plan data");
  }
});

// app.get("/buy/penthouse", async (req, res) => {
//     const penthouses = await checkavailablepenthouse();
//     res.render("BUY_PENTHOUSE.ejs", {
//         penthouses: penthouses
//     });
// });

app.get("/buy/penthouse", async (req, res) => {
  const { price, bed, sqft, location } = req.query;
  const userEmail = req.cookies.userEmail;

  if(!userEmail){
    return res.redirect('/')
  }


  // Build the query dynamically based on filters
  let query = "SELECT id, name, price, bed, bathroom, sqft, location, level, photos FROM buy_penthouses2 WHERE 1=1";
  let values = [];

  if (price) {
    let [minPrice, maxPrice] = price.split('-').map(Number);
    if (minPrice != null && maxPrice != null) {
      query += ` AND price BETWEEN $${values.length + 1} AND $${values.length + 2}`;
      values.push(minPrice, maxPrice);
    }
  }

  if (bed) {
    query += ` AND bed = $${values.length + 1}`;
    values.push(Number(bed));
  }

  if (sqft) {
    let [minSqft, maxSqft] = sqft.split('-').map(Number);
    if (minSqft != null && maxSqft != null) {
      query += ` AND sqft BETWEEN $${values.length + 1} AND $${values.length + 2}`;
      values.push(minSqft, maxSqft);
    } else if (sqft.endsWith('+')) {
      let minSqft = parseInt(sqft, 10);
      query += ` AND sqft >= $${values.length + 1}`;
      values.push(minSqft);
    }
  }

  if (location) {
    query += ` AND location = $${values.length + 1}`;
    values.push(location);
  }

  try {
    const result = await db.query(query, values);
    res.render("BUY_PENTHOUSE.ejs", {
      penthouses: result.rows,
      message: null  // Ensure message is always defined
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching penthouse data");
  }
});


// app.get("/buy/yatch", async (req, res) => {
//     const yatches = await checkavailableyatch();
//     res.render("BUY_YATCH.ejs", {
//         yatches: yatches
//     });
// });


app.get('/buy/yatch', async (req, res) => {
  const { price, cabin, year, type } = req.query;
  const userEmail = req.cookies.userEmail;

  if(!userEmail){
    return res.redirect('/')
  }

  // Build the query dynamically based on filters
  let query = `SELECT id, name, price, type, length, speed, cabin, year, photos FROM buy_yatch2 WHERE 1=1`;
  let values = [];

  if (price) {
    let [minPrice, maxPrice] = price.split('-').map(Number);
    if (minPrice != null && maxPrice != null) {
      query += ` AND price BETWEEN $${values.length + 1} AND $${values.length + 2}`;
      values.push(minPrice, maxPrice);
    }
  }

  if (cabin) {
    query += ` AND cabin = $${values.length + 1}`;
    values.push(Number(cabin));
  }

  if (year) {
    query += ` AND year = $${values.length + 1}`;
    values.push(Number(year));
  }

  if (type) {
    query += ` AND type = $${values.length + 1}`;
    values.push(type);
  }

  try {
    const result = await db.query(query, values);
    res.render('BUY_YATCH.ejs', {
      yatches: result.rows,
      message: null  // Ensure message is always defined
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching yacht data');
  }
});



app.get("/", (req, res) => {
    res.render("Home_page.ejs");
});

// app.get("/cart", (req, res) => {
//     res.render("CART.ejs");
// });


// =====================================================================

app.post('/cart/add', async (req, res) => {
  const { name, price } = req.body;
  const userId = req.user.id;

  await db.query('INSERT INTO cart (user_id, name, price) VALUES ($1, $2, $3)', [userId, name, price]);
  res.redirect('/cart');
});

app.get('/cart', async (req, res) => {
  const userId = req.user.id;

  const result = await db.query('SELECT * FROM cart WHERE user_id = $1', [userId]);

  // console.log(result.rows[0]);

  const total = await db.query('select sum(price) from cart where user_id = $1', [userId]);

  const sum = total.rows[0].sum;
  
  res.render('CART.ejs', { items: result.rows, sum });
});

app.post('/cart/remove', async (req, res) => {
  const { id } = req.body;
  const userId = req.user.id;

  await db.query('DELETE FROM cart WHERE id = $1 AND user_id = $2', [id, userId]);
  res.redirect('/cart');
});


// ======================================================================

app.get("/penthouses", (req, res) => {
    res.render("Penthouse.ejs", {
     userEmail: req.cookies.userEmail

    });
});

app.get("/cars", (req, res) => {
    res.render("Cars.ejs", {
     userEmail: req.cookies.userEmail
    });
});

// app.get("/buy/car", (req, res) => {
//   const userEmail = req.cookies.userEmail;
//   console.log(userEmail);

//     res.render("BUY_CAR.ejs");
// });

app.get("/buy/car", (req, res) => {
  res.render("BUY_CAR.ejs", {
    userEmail: req.cookies.userEmail
  });
});

app.get("/buy/plan", (req, res) => {
    res.render("BUY_PLAN.ejs", {
      userEmail: req.cookies.userEmail
    });
});

app.get("/buy/yatch", (req, res) => {
    res.render("BUY_YATCH.ejs", {
      userEmail: req.cookies.userEmail

    });
});

app.get("/buy/penthouse", (req, res) => {
    res.render("BUY_PENTHOUSE.ejs", {
      userEmail: req.cookies.userEmail

    });
});

app.get("/sell/car", (req, res) => {
    res.render("SELL_CAR.ejs", {
     userEmail: req.cookies.userEmail

    });
});

app.get("/sell/plan", (req, res) => {
    res.render("SELL_PLAN.ejs", {
      userEmail: req.cookies.userEmail

    });
});

app.get("/sell/yatch", (req, res) => {
    res.render("SELL_YATCH.ejs", {
      userEmail: req.cookies.userEmail

    });
});

app.get("/sell/penthouse", (req, res) => {
    res.render("SELL_PENTHOUSE.ejs", {
      userEmail: req.cookies.userEmail

    });
});

app.get("/plans", (req, res) => {
    res.render("Plans.ejs", {
      userEmail: req.cookies.userEmail

    });
    
});

app.get("/yatches", (req, res) => {
    res.render("Yatches.ejs", {
      userEmail: req.cookies.userEmail

    });
});



// app.get("/car/:id", (req, res) => {
//     res.render("CAR_1.ejs");
// });

app.get("/car/:id", async (req, res) => {
  const carId = req.params.id;

  try {
    // Query to fetch car details based on the provided ID
    const query = "SELECT * FROM buy_car2 WHERE id = $1";
    const values = [carId];
    const result = await db.query(query, values);

    if (result.rows.length > 0) {
      // Render the CAR_1.ejs page with the fetched car details
      console.log(result.rows[0]);
      
      res.render("CAR_1.ejs", {
        car: result.rows[0],
        userEmail: req.cookies.userEmail,
      });
    } else {
      // Handle the case where no car is found for the provided ID
      res.status(404).send("Car not found");
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching car details");
  }
});


// app.get("/plan/:id", (req, res) => {
//     res.render("PLAN_1.ejs");
// });

app.get("/plan/:id", async (req, res) => {
  const { id } = req.params;

  try {
      const query = "SELECT id, model, year, price, range, thrust, speed, capacity, type, description, seller_name, seller_email, seller_phone, photos FROM buy_planes2 WHERE id = $1";
      const result = await db.query(query, [id]);

      if (result.rows.length === 0) {
          return res.status(404).send("Plane not found");
      }

      const plan = result.rows[0];
      plan.photos = plan.photos.split(','); // Convert comma-separated photo URLs to an array
      console.log(plan);
      
      res.render("PLAN_1.ejs", {
        userEmail: req.cookies.userEmail,
        plan
       });
  } catch (error) {
      console.error(error);
      res.status(500).send("Server error");
  }
});


// app.get("/yatch/:id", (req, res) => {
//     res.render("YATCH_1.ejs");
// });

app.get('/yatch/:id', async (req, res) => {
  try {
      const id = req.params.id;
      const query = 'SELECT * FROM buy_yatch2 WHERE id = $1';
      const values = [id];
      const result = await db.query(query, values);

      if (result.rows.length === 0) {
          return res.status(404).send('Yacht not found');
      }

      const yatch = result.rows[0];
      res.render('YATCH_1.ejs', { yatch,
        userEmail: req.cookies.userEmail
       });
  } catch (error) {
      console.error(error);
      res.status(500).send('Server error');
  }
});


// app.get("/penthouse/:id", (req, res) => {
//     res.render("PENTHOUSE_1.ejs");
// });

app.get('/penthouse/:id', async (req, res) => {
  try {
      const id = req.params.id;
      const query = 'SELECT * FROM buy_penthouses2 WHERE id = $1';
      const values = [id];
      const result = await db.query(query, values);

      if (result.rows.length === 0) {
          return res.status(404).send('Penthouse not found');
      }

      const penthouse = result.rows[0];
      res.render('PENTHOUSE_1.ejs', { penthouse,
        userEmail: req.cookies.userEmail
       });
  } catch (error) {
      console.error(error);
      res.status(500).send('Server error');
  }
});




app.listen(port, () => {
    console.log(`Backend server is running on http://localhost:${port}`);
  });

// app.get("/penthouses/house1/profile", (req, res) => {
//     res.render("User_profile.ejs");
// });

// app.get
// app.get("/login", (req, res) => {
//     res.render("Login.ejs", {
//         heading: "Login",
//         button: "Login"
//     })
// })

// app.post("/login", (req, res) => {

// })

app.post('/buy/car/:itemId', async (req, res) => {
  const itemId = parseInt(req.params.itemId, 10);
  const { buyerEmail, sellerEmail, itemName, itemPrice, name } = req.body;

  // const db = await db.connect();
  try {
      await db.query('BEGIN');

      // Get the buyer's balance
      const buyerResult = await db.query('SELECT balance FROM users WHERE email = $1', [buyerEmail]);
      const buyerBalance = parseInt(buyerResult.rows[0].balance);
      
      if (buyerBalance >= itemPrice) {
          // Update buyer's balance
          const newBuyerBalance = buyerBalance - itemPrice;
          await db.query('UPDATE users SET balance = $1 WHERE email = $2', [newBuyerBalance, buyerEmail]);

          // Get the seller's balance
          const sellerResult = await db.query('SELECT balance FROM users WHERE email = $1', [sellerEmail]);
          const sellerBalance = parseInt(sellerResult.rows[0].balance);
          console.log(typeof itemPrice);
          
          // Update seller's balance
          const newSellerBalance = sellerBalance + parseInt(itemPrice);
          await db.query('UPDATE users SET balance = $1 WHERE email = $2', [newSellerBalance, sellerEmail]);

          // Insert a record into the purchase table
          await db.query(
              `INSERT INTO purchase_history (buyer_email, seller_email, item_name, item_price, item_id, name) VALUES ($1, $2, $3, $4, $5, $6)`,
              [buyerEmail, sellerEmail, itemName, itemPrice, itemId, name]
          );
          await db.query('DELETE FROM buy_car2 WHERE id = $1', [itemId]);

          await db.query('COMMIT');
          res.redirect("/buy/car");
      } else {
        res.redirect("/buy/car");

      }
  } catch (error) {
      await db.query('ROLLBACK');
      res.redirect("/buy/car");

  } 
});

app.post('/buy/plan/:itemId', async (req, res) => {
  const itemId = parseInt(req.params.itemId, 10);
  const { buyerEmail, sellerEmail, itemName, itemPrice, name } = req.body;
  console.log(req.body);

  // const db = await db.connect();
  try {
      await db.query('BEGIN');

      // Get the buyer's balance
      const buyerResult = await db.query('SELECT balance FROM users WHERE email = $1', [buyerEmail]);
      const buyerBalance = parseInt(buyerResult.rows[0].balance);
      
      
      if (buyerBalance >= parseInt(itemPrice)) {
          // Update buyer's balance
          const newBuyerBalance = buyerBalance - itemPrice;
          await db.query('UPDATE users SET balance = $1 WHERE email = $2', [newBuyerBalance, buyerEmail]);

          // Get the seller's balance
          const sellerResult = await db.query('SELECT balance FROM users WHERE email = $1', [sellerEmail]);
          const sellerBalance = parseInt(sellerResult.rows[0].balance);
          console.log(typeof itemPrice);
          
          // Update seller's balance
          const newSellerBalance = sellerBalance + parseInt(itemPrice);
          await db.query('UPDATE users SET balance = $1 WHERE email = $2', [newSellerBalance, sellerEmail]);

          // Insert a record into the purchase table
          await db.query(
              `INSERT INTO purchase_history (buyer_email, seller_email, item_name, item_price, item_id, name) VALUES ($1, $2, $3, $4, $5, $6)`,
              [buyerEmail, sellerEmail, itemName, itemPrice, itemId, name]
          );
          await db.query('DELETE FROM buy_planes2 WHERE id = $1', [itemId]);

          await db.query('COMMIT');
          res.redirect("/buy/plan");
      } else {
        console.log('error');
        
        res.redirect("/buy/plan");

      }
  } catch (error) {
    console.log('errorrr');
    
      await db.query('ROLLBACK');
      res.redirect("/buy/plan");

  } 
});

app.post('/buy/yatch/:itemId', async (req, res) => {
  const itemId = parseInt(req.params.itemId, 10);
  const { buyerEmail, sellerEmail, itemName, itemPrice, name } = req.body;
  console.log(req.body);

  // const db = await db.connect();
  try {
      await db.query('BEGIN');

      // Get the buyer's balance
      const buyerResult = await db.query('SELECT balance FROM users WHERE email = $1', [buyerEmail]);
      const buyerBalance = parseInt(buyerResult.rows[0].balance);
      
      
      if (buyerBalance >= parseInt(itemPrice)) {
          // Update buyer's balance
          const newBuyerBalance = buyerBalance - itemPrice;
          await db.query('UPDATE users SET balance = $1 WHERE email = $2', [newBuyerBalance, buyerEmail]);

          // Get the seller's balance
          const sellerResult = await db.query('SELECT balance FROM users WHERE email = $1', [sellerEmail]);
          const sellerBalance = parseInt(sellerResult.rows[0].balance);
          console.log(typeof itemPrice);
          
          // Update seller's balance
          const newSellerBalance = sellerBalance + parseInt(itemPrice);
          await db.query('UPDATE users SET balance = $1 WHERE email = $2', [newSellerBalance, sellerEmail]);

          // Insert a record into the purchase table
          await db.query(
              `INSERT INTO purchase_history (buyer_email, seller_email, item_name, item_price, item_id, name) VALUES ($1, $2, $3, $4, $5, $6)`,
              [buyerEmail, sellerEmail, itemName, itemPrice, itemId, name]
          );
          await db.query('DELETE FROM buy_yatch2 WHERE id = $1', [itemId]);

          await db.query('COMMIT');
          res.redirect("/buy/yatch");
      } else {
        console.log('error');
        
        res.redirect("/buy/yatch");

      }
  } catch (error) {
    console.log('errorrr');
    
      await db.query('ROLLBACK');
      res.redirect("/buy/yatch");

  } 
});

app.post('/buy/penthouse/:itemId', async (req, res) => {
  const itemId = parseInt(req.params.itemId, 10);
  const { buyerEmail, sellerEmail, itemName, itemPrice, name } = req.body;
  console.log(req.body);

  // const db = await db.connect();
  try {
      await db.query('BEGIN');

      // Get the buyer's balance
      const buyerResult = await db.query('SELECT balance FROM users WHERE email = $1', [buyerEmail]);
      const buyerBalance = parseInt(buyerResult.rows[0].balance);
      
      
      if (buyerBalance >= parseInt(itemPrice)) {
          // Update buyer's balance
          const newBuyerBalance = buyerBalance - itemPrice;
          await db.query('UPDATE users SET balance = $1 WHERE email = $2', [newBuyerBalance, buyerEmail]);

          // Get the seller's balance
          const sellerResult = await db.query('SELECT balance FROM users WHERE email = $1', [sellerEmail]);
          const sellerBalance = parseInt(sellerResult.rows[0].balance);
          console.log(typeof itemPrice);
          
          // Update seller's balance
          const newSellerBalance = sellerBalance + parseInt(itemPrice);
          await db.query('UPDATE users SET balance = $1 WHERE email = $2', [newSellerBalance, sellerEmail]);

          // Insert a record into the purchase table
          await db.query(
              `INSERT INTO purchase_history (buyer_email, seller_email, item_name, item_price, item_id, name) VALUES ($1, $2, $3, $4, $5, $6)`,
              [buyerEmail, sellerEmail, itemName, itemPrice, itemId, name]
          );
          await db.query('DELETE FROM buy_penthouses2 WHERE id = $1', [itemId]);

          await db.query('COMMIT');
          res.redirect("/buy/penthouse");
      } else {
        console.log('error');
        
        res.redirect("/buy/penthouse");

      }
  } catch (error) {
    console.log('errorrr');
    
      await db.query('ROLLBACK');
      res.redirect("/buy/penthouse");

  } 
});