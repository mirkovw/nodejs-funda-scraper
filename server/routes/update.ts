import { Router } from 'express';
import { runUpdate } from '../../scraper/updater';

const router = Router();

router.post('/', async (req, res) => {
  try {
    // runUpdate is async, but we don't want to wait for it to finish
    runUpdate();
    res.status(202).json({ message: 'Update process started.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to start update process.', error });
  }
});

export default router;
