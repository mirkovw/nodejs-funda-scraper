import express from 'express';
import updateRouter from './routes/update';
import listingsRouter from './routes/listings';

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static('public'));

app.use('/api/update', updateRouter);
app.use('/api/listings', listingsRouter);

export const startServer = () => {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
};
