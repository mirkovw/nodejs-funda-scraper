import cors from 'cors';
import express from 'express';
import path from 'path'; // Import path module
import listingsRouter from './routes/listings';
import updateRouter from './routes/update';

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());
app.use(cors({
  origin: '*'
}));

// Serve static files from the React app's build directory
app.use(express.static(path.join(__dirname, '../../client/build')));

app.use('/api/update', updateRouter);
app.use('/api/listings', listingsRouter);

// All other GET requests not handled by the API will return the React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../client/build', 'index.html'));
});

export const startServer = () => {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
};
