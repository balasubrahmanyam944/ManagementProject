// Mock faker for testing without external dependency
const faker = {
  datatype: {
    uuid: () => Math.random().toString(36).substring(2, 15),
    number: (options: { min: number; max: number }) => 
      Math.floor(Math.random() * (options.max - options.min + 1)) + options.min,
    boolean: () => Math.random() > 0.5
  },
  random: {
    alpha: (options: { count: number; casing: 'upper' | 'lower' }) => 
      Array.from({ length: options.count }, () => 
        String.fromCharCode(65 + Math.floor(Math.random() * 26))
      ).join('').toLowerCase().toUpperCase()
  },
  lorem: {
    sentence: () => 'Test sentence for mock data',
    paragraphs: (count: number) => Array.from({ length: count }, () => 'Test paragraph').join('\n')
  },
  name: {
    fullName: () => 'Test User'
  },
  internet: {
    email: () => 'test@example.com',
    url: () => 'https://example.com',
    userName: () => 'testuser'
  },
  image: {
    avatar: () => 'https://example.com/avatar.jpg',
    imageUrl: (width: number, height: number) => `https://example.com/image-${width}x${height}.jpg`
  },
  company: {
    name: () => 'Test Company'
  },
  date: {
    past: () => new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
    recent: () => new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
    future: () => new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000)
  },
  helpers: {
    arrayElement: <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)],
    arrayElements: <T>(arr: T[], count: number) => 
      Array.from({ length: count }, () => arr[Math.floor(Math.random() * arr.length)])
  },
  seed: (seed: number) => { /* Mock seed function */ },
  setLocale: (locale: string) => { /* Mock locale function */ }
};

// Mock types for integrations
interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  description: string;
  status: string;
  assignee: any;
  reporter: any;
  priority: any;
  issueType: any;
  project: any;
  created: string;
  updated: string;
  resolutiondate: string | null;
  duedate: string | null;
  labels: string[];
  components: any[];
  fixVersions: any[];
}

interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  url: string;
  shortUrl: string;
  pos: number;
  dateLastActivity: string;
  due: string | null;
  dueComplete: boolean;
  closed: boolean;
  idBoard: string;
  idList: string;
  idMembers: string[];
  idLabels: string[];
  labels: any[];
  members: any[];
}

/**
 * Test configuration
 */
export interface TestConfig {
  seed?: string;
  locale?: string;
  timezone?: string;
}

/**
 * Mock data generators
 */
export class MockDataGenerator {
  constructor(private config: TestConfig = {}) {
    if (config.seed) {
      faker.seed(parseInt(config.seed) || 12345);
    }
    if (config.locale) {
      faker.setLocale(config.locale);
    }
  }

  /**
   * Generate mock Jira issue
   */
  generateJiraIssue(overrides: Partial<JiraIssue> = {}): JiraIssue {
    const statuses = ['To Do', 'In Progress', 'Done', 'Blocked'];
    const types = ['Bug', 'Story', 'Task', 'Epic'];
    const priorities = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];

    return {
      id: faker.datatype.uuid(),
      key: `${faker.random.alpha({ count: 3, casing: 'upper' })}-${faker.datatype.number({ min: 1, max: 9999 })}`,
      summary: faker.lorem.sentence(),
      description: faker.lorem.paragraphs(2),
      status: faker.helpers.arrayElement(statuses),
      assignee: {
        id: faker.datatype.uuid(),
        displayName: faker.name.fullName(),
        emailAddress: faker.internet.email(),
        avatarUrls: {
          '16x16': faker.image.avatar(),
          '24x24': faker.image.avatar(),
          '32x32': faker.image.avatar(),
          '48x48': faker.image.avatar()
        }
      },
      reporter: {
        id: faker.datatype.uuid(),
        displayName: faker.name.fullName(),
        emailAddress: faker.internet.email(),
        avatarUrls: {
          '16x16': faker.image.avatar(),
          '24x24': faker.image.avatar(),
          '32x32': faker.image.avatar(),
          '48x48': faker.image.avatar()
        }
      },
      priority: {
        name: faker.helpers.arrayElement(priorities),
        iconUrl: faker.image.imageUrl(16, 16)
      },
      issueType: {
        name: faker.helpers.arrayElement(types),
        iconUrl: faker.image.imageUrl(16, 16)
      },
      project: {
        id: faker.datatype.uuid(),
        key: faker.random.alpha({ count: 3, casing: 'upper' }),
        name: faker.company.name()
      },
      created: faker.date.past().toISOString(),
      updated: faker.date.recent().toISOString(),
      resolutiondate: faker.datatype.boolean() ? faker.date.recent().toISOString() : null,
      duedate: faker.datatype.boolean() ? faker.date.future().toISOString() : null,
      labels: faker.helpers.arrayElements([
        'frontend', 'backend', 'urgent', 'technical-debt', 'feature'
      ], faker.datatype.number({ min: 0, max: 3 })),
      components: faker.helpers.arrayElements([
        { name: 'Authentication' },
        { name: 'API' },
        { name: 'UI' },
        { name: 'Database' }
      ], faker.datatype.number({ min: 0, max: 2 })),
      fixVersions: faker.helpers.arrayElements([
        { name: '1.0.0' },
        { name: '1.1.0' },
        { name: '2.0.0' }
      ], faker.datatype.number({ min: 0, max: 1 })),
      ...overrides
    };
  }

  /**
   * Generate mock Trello card
   */
  generateTrelloCard(overrides: Partial<TrelloCard> = {}): TrelloCard {
    return {
      id: faker.datatype.uuid(),
      name: faker.lorem.sentence(),
      desc: faker.lorem.paragraphs(2),
      url: faker.internet.url(),
      shortUrl: faker.internet.url(),
      pos: faker.datatype.number({ min: 1, max: 65535 }),
      dateLastActivity: faker.date.recent().toISOString(),
      due: faker.datatype.boolean() ? faker.date.future().toISOString() : null,
      dueComplete: faker.datatype.boolean(),
      closed: faker.datatype.boolean(),
      idBoard: faker.datatype.uuid(),
      idList: faker.datatype.uuid(),
      idMembers: faker.helpers.arrayElements([
        faker.datatype.uuid(),
        faker.datatype.uuid(),
        faker.datatype.uuid()
      ], faker.datatype.number({ min: 0, max: 3 })),
      idLabels: faker.helpers.arrayElements([
        faker.datatype.uuid(),
        faker.datatype.uuid(),
        faker.datatype.uuid()
      ], faker.datatype.number({ min: 0, max: 3 })),
      labels: faker.helpers.arrayElements([
        { id: faker.datatype.uuid(), name: 'Frontend', color: 'blue' },
        { id: faker.datatype.uuid(), name: 'Backend', color: 'green' },
        { id: faker.datatype.uuid(), name: 'Bug', color: 'red' },
        { id: faker.datatype.uuid(), name: 'Feature', color: 'yellow' }
      ], faker.datatype.number({ min: 0, max: 3 })),
      members: faker.helpers.arrayElements([
        {
          id: faker.datatype.uuid(),
          username: faker.internet.userName(),
          fullName: faker.name.fullName(),
          avatarHash: faker.datatype.uuid()
        }
      ], faker.datatype.number({ min: 0, max: 3 })),
      ...overrides
    };
  }

  /**
   * Generate multiple items
   */
  generateMultiple<T>(
    generator: () => T,
    count: number = faker.datatype.number({ min: 5, max: 20 })
  ): T[] {
    return Array.from({ length: count }, () => generator());
  }

  /**
   * Generate time series data
   */
  generateTimeSeriesData(
    startDate: Date,
    endDate: Date,
    valueGenerator: () => number = () => faker.datatype.number({ min: 0, max: 100 })
  ): Array<{ date: string; value: number }> {
    const data: Array<{ date: string; value: number }> = [];
    const current = new Date(startDate);
    
    while (current <= endDate) {
      data.push({
        date: current.toISOString().split('T')[0],
        value: valueGenerator()
      });
      current.setDate(current.getDate() + 1);
    }
    
    return data;
  }
}

/**
 * Test assertion helpers
 */
export class TestAssertions {
  /**
   * Assert that an object has required properties
   */
  static hasRequiredProperties<T>(
    object: any,
    requiredProps: (keyof T)[],
    objectName: string = 'object'
  ): void {
    const missing = requiredProps.filter(prop => !(prop in object));
    if (missing.length > 0) {
      throw new Error(`${objectName} is missing required properties: ${missing.join(', ')}`);
    }
  }

  /**
   * Assert that arrays have the same length
   */
  static haveSameLength(arr1: any[], arr2: any[], message?: string): void {
    if (arr1.length !== arr2.length) {
      throw new Error(message || `Arrays have different lengths: ${arr1.length} vs ${arr2.length}`);
    }
  }

  /**
   * Assert that a value is within a range
   */
  static isWithinRange(value: number, min: number, max: number, message?: string): void {
    if (value < min || value > max) {
      throw new Error(message || `Value ${value} is not within range [${min}, ${max}]`);
    }
  }

  /**
   * Assert that a date is within a time range
   */
  static isWithinTimeRange(date: Date, startDate: Date, endDate: Date, message?: string): void {
    if (date < startDate || date > endDate) {
      throw new Error(message || `Date ${date.toISOString()} is not within range [${startDate.toISOString()}, ${endDate.toISOString()}]`);
    }
  }

  /**
   * Assert that an async function throws
   */
  static async throws(
    fn: () => Promise<any>,
    expectedError?: string | RegExp | Error,
    message?: string
  ): Promise<void> {
    try {
      await fn();
      throw new Error(message || 'Expected function to throw but it did not');
    } catch (error: unknown) {
      if (expectedError) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorConstructor = error instanceof Error ? error.constructor : Error;
        
        if (typeof expectedError === 'string') {
          if (!errorMessage.includes(expectedError)) {
            throw new Error(`Expected error message to contain "${expectedError}" but got "${errorMessage}"`);
          }
        } else if (expectedError instanceof RegExp) {
          if (!expectedError.test(errorMessage)) {
            throw new Error(`Expected error message to match ${expectedError} but got "${errorMessage}"`);
          }
        } else if (expectedError instanceof Error) {
          if (errorConstructor !== expectedError.constructor) {
            throw new Error(`Expected error type ${expectedError.constructor.name} but got ${errorConstructor.name}`);
          }
        }
      }
    }
  }

  /**
   * Assert that performance is within acceptable bounds
   */
  static async performanceIsAcceptable(
    fn: () => Promise<any>,
    maxDurationMs: number,
    message?: string
  ): Promise<void> {
    const start = performance.now();
    await fn();
    const duration = performance.now() - start;
    
    if (duration > maxDurationMs) {
      throw new Error(message || `Performance test failed: ${duration}ms > ${maxDurationMs}ms`);
    }
  }
}

/**
 * Mock HTTP client for testing
 */
export class MockHttpClient {
  private responses = new Map<string, any>();
  private requests: Array<{ method: string; url: string; data?: any; headers?: any }> = [];

  /**
   * Set a mock response for a specific URL
   */
  mockResponse(method: string, url: string, response: any, status: number = 200): void {
    const key = `${method.toLowerCase()}:${url}`;
    this.responses.set(key, { data: response, status });
  }

  /**
   * Mock HTTP request
   */
  async request(method: string, url: string, data?: any, headers?: any): Promise<any> {
    this.requests.push({ method, url, data, headers });
    
    const key = `${method.toLowerCase()}:${url}`;
    const response = this.responses.get(key);
    
    if (!response) {
      throw new Error(`No mock response configured for ${method} ${url}`);
    }
    
    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
    }
    
    return response.data;
  }

  /**
   * Get all requests made
   */
  getRequests(): Array<{ method: string; url: string; data?: any; headers?: any }> {
    return [...this.requests];
  }

  /**
   * Clear all requests and responses
   */
  reset(): void {
    this.responses.clear();
    this.requests = [];
  }

  /**
   * Assert that a request was made
   */
  assertRequestMade(method: string, url: string, message?: string): void {
    const found = this.requests.some(req => 
      req.method.toLowerCase() === method.toLowerCase() && req.url === url
    );
    
    if (!found) {
      throw new Error(message || `Expected request ${method} ${url} was not made`);
    }
  }

  /**
   * Assert request count
   */
  assertRequestCount(expectedCount: number, message?: string): void {
    if (this.requests.length !== expectedCount) {
      throw new Error(message || `Expected ${expectedCount} requests but got ${this.requests.length}`);
    }
  }
}

/**
 * Test database helpers
 */
export class TestDatabase {
  private data = new Map<string, any[]>();

  /**
   * Seed collection with test data
   */
  seed<T>(collection: string, data: T[]): void {
    this.data.set(collection, [...data]);
  }

  /**
   * Get all items from collection
   */
  getAll<T>(collection: string): T[] {
    return this.data.get(collection) || [];
  }

  /**
   * Find items in collection
   */
  find<T>(collection: string, predicate: (item: T) => boolean): T[] {
    const items = this.getAll<T>(collection);
    return items.filter(predicate);
  }

  /**
   * Find one item in collection
   */
  findOne<T>(collection: string, predicate: (item: T) => boolean): T | null {
    const items = this.find<T>(collection, predicate);
    return items[0] || null;
  }

  /**
   * Add item to collection
   */
  add<T>(collection: string, item: T): void {
    const items = this.getAll<T>(collection);
    items.push(item);
    this.data.set(collection, items);
  }

  /**
   * Clear all collections
   */
  clear(): void {
    this.data.clear();
  }

  /**
   * Clear specific collection
   */
  clearCollection(collection: string): void {
    this.data.delete(collection);
  }
}

/**
 * Global test utilities
 */
export const testUtils = {
  mockData: new MockDataGenerator(),
  assertions: TestAssertions,
  httpClient: new MockHttpClient(),
  database: new TestDatabase(),

  /**
   * Create a test environment
   */
  createTestEnv(config: TestConfig = {}) {
    return {
      mockData: new MockDataGenerator(config),
      httpClient: new MockHttpClient(),
      database: new TestDatabase()
    };
  },

  /**
   * Wait for a condition to be true
   */
  async waitFor(
    condition: () => boolean | Promise<boolean>,
    timeoutMs: number = 5000,
    intervalMs: number = 100
  ): Promise<void> {
    const start = Date.now();
    
    while (Date.now() - start < timeoutMs) {
      const result = await condition();
      if (result) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    throw new Error(`Condition not met within ${timeoutMs}ms`);
  },

  /**
   * Measure execution time
   */
  async measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
    const start = performance.now();
    const result = await fn();
    const durationMs = performance.now() - start;
    
    return { result, durationMs };
  },

  /**
   * Create isolated test scope
   */
  isolate<T>(fn: () => T): T {
    // Save current state
    const originalConsole = { ...console };
    const originalProcess = { ...process };
    
    try {
      return fn();
    } finally {
      // Restore state
      Object.assign(console, originalConsole);
      Object.assign(process, originalProcess);
    }
  }
}; 