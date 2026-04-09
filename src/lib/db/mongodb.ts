import { MongoClient, Db, ObjectId } from 'mongodb'

if (!process.env.DATABASE_URL) {
  throw new Error('Please add your Mongo URI to .env.local')
}

const uri = process.env.DATABASE_URL
const options = {}

let client: MongoClient
let clientPromise: Promise<MongoClient>

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  let globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>
  }

  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options)
    globalWithMongo._mongoClientPromise = client.connect()
  }
  clientPromise = globalWithMongo._mongoClientPromise
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options)
  clientPromise = client.connect()
}

// Export a module-scoped MongoClient promise. By doing this in a
// separate module, the client can be shared across functions.
export default clientPromise

// Helper function to get database instance
export async function getDatabase(): Promise<Db> {
  const client = await clientPromise
  return client.db()
}

// Helper function to get collections
export async function getCollection(collectionName: string) {
  const db = await getDatabase()
  return db.collection(collectionName)
}

// Collection names
export const COLLECTIONS = {
  USERS: 'users',
  ACCOUNTS: 'accounts',
  SESSIONS: 'sessions',
  SUBSCRIPTIONS: 'subscriptions',
  INTEGRATIONS: 'integrations',
  PROJECTS: 'projects',
  AUDIT_LOGS: 'audit_logs',
  TESTCASES: 'testcases',
  WEBHOOKS: 'webhooks',
  WEBHOOK_EVENTS: 'webhook_events',
  CUSTOM_BOARDS: 'custom_boards',
  CUSTOM_BOARD_CARDS: 'custom_board_cards',
  SPRINTS: 'sprints',
  CARD_ACTIVITIES: 'card_activities',
  SPRINT_PERFORMANCE: 'sprint_performance',
  PERFORMANCE_CONFIG: 'performance_config',
} as const

// Helper function to convert string ID to ObjectId
export function toObjectId(id: string): ObjectId | null {
  try {
    // Check if the string is a valid ObjectId format (24 hex characters)
    if (!id || typeof id !== 'string' || id.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return null;
    }
    return new ObjectId(id);
  } catch (error) {
    console.warn('Invalid ObjectId format:', id);
    return null;
  }
}

// Helper function to convert ObjectId to string
export function fromObjectId(id: ObjectId): string {
  return id.toString()
} 