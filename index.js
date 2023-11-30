const express = require('express');
const cors = require('cors');
const app = express();
const jwt = require('jsonwebtoken');
require('dotenv').config();

const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.phi4gnz.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const swiftParcelDB = client.db('swiftParcelDB');
        const userCollection = swiftParcelDB.collection("users");
        const parcelCollection = swiftParcelDB.collection("parcelCollection");

        // jwt related api
        // require('crypto').randomBytes(64).toString('hex')
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '12h' });
            res.send({ token });
        })

        // middlewares 
        const verifyToken = (req, res, next) => {
            // console.log('inside verify token', req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next();
            })
        }

        // use verify admin after verifyToken
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        // users related api
        app.get('/users', verifyToken, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        app.get('/users/delivery-man', async (req, res) => {
            const userTypeFilter = { role: 'deliveryMan' };
            const result = await userCollection.find(userTypeFilter).toArray();
            res.send(result);
        });

        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;

            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }

            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            // insert email if user doesnt exists: 
            // you can do this many ways (1. email unique, 2. upsert 3. simple checking)
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null })
            }
            console.log('hello2 from server');
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        app.get('/parcels/search-date', verifyToken, async (req, res) => {
            try {
                const { startDate, endDate } = req.query;

                // Parse dates
                const startDateTime = new Date(startDate);
                const endDateTime = new Date(endDate);

                // Ensure that the dates are valid
                if (isNaN(startDateTime) || isNaN(endDateTime)) {
                    return res.status(400).json({ error: 'Invalid date format' });
                }

                // MongoDB query
                const result = await parcelCollection.find({
                    deliveryDate: {
                        $gte: startDateTime,
                        $lte: endDateTime,
                    },
                }).toArray();

                console.log(result);
                res.json(result);
            } catch (error) {
                console.error('Error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        app.patch('/users/book-count/:email', verifyToken, async (req, res) => {
            const item = req.body;
            const email = req.params.email;
            const filter = { email: email };
            const updateQuery = {
                $inc: {
                    bookedParcelCount: 1,
                    totalAmount: item.totalAmountInc
                },
            };
            const result = await userCollection.updateOne(filter, updateQuery);
            res.send(result);
        })

        app.patch('/users/change-role/:id', verifyToken, async (req, res) => {
            const item = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updateQuery = {
                $set: {
                    role: item.role
                },
            };
            const result = await userCollection.updateOne(filter, updateQuery);
            res.send(result);
        })

        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })

        // menu related apis
        app.get('/parcel', async (req, res) => {
            const result = await parcelCollection.find().toArray();
            res.send(result);
        });

        app.get('/menu/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await menuCollection.findOne(query);
            res.send(result);
        })

        app.post('/parcel', verifyToken, async (req, res) => {
            console.log('book-parcel hit');
            const item = req.body;
            const deliveryDate = new Date(item.deliveryDate);
            item.deliveryDate = deliveryDate;
            const result = await parcelCollection.insertOne(item);
            res.send(result);
        });

        app.put('/parcel/:id', verifyToken, async (req, res) => {
            const item = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true }
            const updatedDoc = {
                $set: {
                    phoneNumber: item.phoneNumber,
                    parcelType: item.parcelType,
                    parcelWeight: item.parcelWeight,
                    receiverName: item.receiverName,
                    receiverPhone: item.receiverPhone,
                    deliveryAddress: item.deliveryAddress,
                    deliveryDate: item.deliveryDate,
                    deliveryDateReq: item.deliveryDateReq,
                    deliveryLat: item.deliveryLat,
                    deliveryLong: item.deliveryLong,
                    price: item.price,
                }
            }

            const result = await parcelCollection.updateOne(filter, updatedDoc, options)
            res.send(result);
        })

        app.patch('/parcel/:id', verifyToken, async (req, res) => {
            const item = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true }
            const updatedDoc = {
                $set: {
                    status: item.status,
                    deliveryManId: item.deliveryManId,
                    estimatedDeliveryDate: item.estimatedDeliveryDate
                }
            }

            const result = await parcelCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })

        app.patch('/cancel-parcel/:id', verifyToken, async (req, res) => {
            const item = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    status: item.status
                }
            }

            const result = await parcelCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })

        app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await menuCollection.deleteOne(query);
            res.send(result);
        })

        app.get('/reviews', async (req, res) => {
            const result = await reviewCollection.find().toArray();
            res.send(result);
        })

        // home apis
        app.get('/home-stats', async (req, res) => {
            const bookedParcelsCount = await parcelCollection.countDocuments({ status: 'pending' });
            const deliverdParcelsCount = await parcelCollection.countDocuments({ status: 'delivered' });
            const usersCount = await userCollection.estimatedDocumentCount({ status: 'user' });

            res.send({ bookedParcelsCount, deliverdParcelsCount, usersCount });
        });

        app.get('/top-delivery-men', async (req, res) => {
            const topDeliveryMen = await userCollection.find({ role: 'deliveryMan' })
                .sort({ parcelsDelivered: -1, averageRatings: -1 })
                .limit(5)
                .toArray();

            res.send(topDeliveryMen);
        });

        // carts collection
        app.get('/carts', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await cartCollection.find(query).toArray();
            res.send(result);
        });

        app.post('/carts', async (req, res) => {
            const cartItem = req.body;
            const result = await cartCollection.insertOne(cartItem);
            res.send(result);
        });

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        });

        // payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            console.log(amount, 'amount inside the intent')

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        });


        app.get('/payments/:email', verifyToken, async (req, res) => {
            const query = { email: req.params.email }
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment);

            //  carefully delete each item from the cart
            console.log('payment info', payment);
            const query = {
                _id: {
                    $in: payment.cartIds.map(id => new ObjectId(id))
                }
            };

            const deleteResult = await cartCollection.deleteMany(query);

            // send user email about payment confirmation
            mg.messages
                .create(process.env.MAIL_SENDING_DOMAIN, {
                    from: "Mailgun Sandbox <postmaster@sandboxbdfffae822db40f6b0ccc96ae1cb28f3.mailgun.org>",
                    to: ["jhankarmahbub7@gmail.com"],
                    subject: "Bistro Boss Order Confirmation",
                    text: "Testing some Mailgun awesomness!",
                    html: `
            <div>
              <h2>Thank you for your order</h2>
              <h4>Your Transaction Id: <strong>${payment.transactionId}</strong></h4>
              <p>We would like to get your feedback about the food</p>
            </div>
          `
                })
                .then(msg => console.log(msg)) // logs response data
                .catch(err => console.log(err)); // logs any error`;

            res.send({ paymentResult, deleteResult });
        })

        // stats or analytics
        app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
            const users = await userCollection.estimatedDocumentCount();
            const menuItems = await menuCollection.estimatedDocumentCount();
            const orders = await paymentCollection.estimatedDocumentCount();

            // this is not the best way
            // const payments = await paymentCollection.find().toArray();
            // const revenue = payments.reduce((total, payment) => total + payment.price, 0);

            const result = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: {
                            $sum: '$price'
                        }
                    }
                }
            ]).toArray();

            const revenue = result.length > 0 ? result[0].totalRevenue : 0;

            res.send({
                users,
                menuItems,
                orders,
                revenue
            })
        })


        // order status
        /**
         * ----------------------------
         *    NON-Efficient Way
         * ------------------------------
         * 1. load all the payments
         * 2. for every menuItemIds (which is an array), go find the item from menu collection
         * 3. for every item in the menu collection that you found from a payment entry (document)
        */

        // using aggregate pipeline
        app.get('/order-stats', verifyToken, verifyAdmin, async (req, res) => {
            const result = await paymentCollection.aggregate([
                {
                    $unwind: '$menuItemIds'
                },
                {
                    $lookup: {
                        from: 'menu',
                        localField: 'menuItemIds',
                        foreignField: '_id',
                        as: 'menuItems'
                    }
                },
                {
                    $unwind: '$menuItems'
                },
                {
                    $group: {
                        _id: '$menuItems.category',
                        quantity: { $sum: 1 },
                        revenue: { $sum: '$menuItems.price' }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        category: '$_id',
                        quantity: '$quantity',
                        revenue: '$revenue'
                    }
                }
            ]).toArray();

            res.send(result);

        })

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('swift is running')
})

app.listen(port, () => {
    console.log(`swift is running on port ${port}`);
})
