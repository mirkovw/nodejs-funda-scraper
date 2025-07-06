import { Router } from 'express';
import { getAllListings } from '../../utils/mongodb';
import { mapListingsToFeatureCollection } from '../../utils/listings';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const listings = await getAllListings();
    const featureCollection = await mapListingsToFeatureCollection(listings);
    res.json(featureCollection);
  } catch (error) {
    res.status(500).json({ message: 'Failed to retrieve listings.', error });
  }
});

export default router;
