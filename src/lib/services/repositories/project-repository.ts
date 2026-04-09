import { CachedRepository, PaginatedRepository, PaginatedResult, PaginationOptions } from '../base/repository';
import { AuthClient, AuthProvider } from '@/lib/auth';
import { ValidationService } from '@/lib/validation';
import { ProjectSchema, ProjectWithAnalyticsSchema, type Project, type ProjectWithAnalytics } from '@/lib/validation/schemas';
import { logger } from '@/lib/utils/logger';
import { ExternalServiceError, ValidationError } from '@/lib/errors/error-handler';

export interface ProjectFilters {
  type?: 'jira' | 'trello';
  hasAnalytics?: boolean;
  search?: string;
  projectTypeKey?: string;
}

export interface ProjectAnalytics {
  totalIssues: number;
  openIssues: number;
  inProgressIssues: number;
  doneIssues: number;
}

/**
 * Repository for managing projects from both Jira and Trello
 */
export class ProjectRepository extends CachedRepository<ProjectWithAnalytics, string> 
  implements PaginatedRepository<ProjectWithAnalytics, string> {
  
  protected entityName = 'Project';
  protected cachePrefix = 'project';
  private authClient: AuthClient;

  constructor() {
    super();
    this.authClient = new AuthClient();
  }

  /**
   * Find project by ID, checking both Jira and Trello
   */
  protected async findByIdUncached(id: string): Promise<ProjectWithAnalytics | null> {
    const context = 'ProjectRepository.findByIdUncached';
    this.logOperation('findById', { id });

    try {
      // Try Jira first
      const jiraProject = await this.findJiraProject(id);
      if (jiraProject) {
        return jiraProject;
      }

      // Then try Trello
      const trelloProject = await this.findTrelloProject(id);
      return trelloProject;
    } catch (error) {
      this.handleError('findById', error, context);
    }
  }

  /**
   * Find all projects with optional filters
   */
  async findAll(filters: ProjectFilters = {}): Promise<ProjectWithAnalytics[]> {
    const context = 'ProjectRepository.findAll';
    this.logOperation('findAll', { filters });

    try {
      const cacheKey = `findAll:${JSON.stringify(filters)}`;
      const cached = this.getCached<ProjectWithAnalytics[]>(cacheKey);
      if (cached) {
        this.logOperation('findAll (cached)', { count: cached.length });
        return cached;
      }

      const projects: ProjectWithAnalytics[] = [];

      // Fetch from Jira if not filtered to Trello only
      if (!filters.type || filters.type === 'jira') {
        try {
          const jiraProjects = await this.findJiraProjects(filters);
          projects.push(...jiraProjects);
        } catch (error) {
          logger.warn('Failed to fetch Jira projects', { error }, context);
        }
      }

      // Fetch from Trello if not filtered to Jira only
      if (!filters.type || filters.type === 'trello') {
        try {
          const trelloProjects = await this.findTrelloProjects(filters);
          projects.push(...trelloProjects);
        } catch (error) {
          logger.warn('Failed to fetch Trello projects', { error }, context);
        }
      }

      // Apply additional filters
      const filteredProjects = this.applyFilters(projects, filters);
      
      // Cache results for 5 minutes
      this.setCached(cacheKey, filteredProjects, 300);
      
      this.logOperation('findAll', { count: filteredProjects.length });
      return filteredProjects;
    } catch (error) {
      this.handleError('findAll', error, context);
    }
  }

  /**
   * Find all projects with pagination
   */
  async findAllPaginated(
    filters: ProjectFilters = {},
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ProjectWithAnalytics>> {
    const context = 'ProjectRepository.findAllPaginated';
    const { page = 1, limit = 20, sortBy = 'name', sortOrder = 'asc' } = options;

    try {
      const allProjects = await this.findAll(filters);
      
      // Sort projects
      const sortedProjects = this.sortProjects(allProjects, sortBy, sortOrder);
      
      // Calculate pagination
      const total = sortedProjects.length;
      const totalPages = Math.ceil(total / limit);
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const data = sortedProjects.slice(startIndex, endIndex);

      const result: PaginatedResult<ProjectWithAnalytics> = {
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrevious: page > 1
        }
      };

      this.logOperation('findAllPaginated', { 
        page, 
        limit, 
        total, 
        totalPages,
        returned: data.length 
      });

      return result;
    } catch (error) {
      this.handleError('findAllPaginated', error, context);
    }
  }

  /**
   * Create operation is not supported for external projects
   */
  async create(entity: Omit<ProjectWithAnalytics, 'id'>): Promise<ProjectWithAnalytics> {
    throw new ValidationError('Creating projects is not supported through this repository', 'ProjectRepository.create');
  }

  /**
   * Update operation is not supported for external projects
   */
  async update(id: string, updates: Partial<ProjectWithAnalytics>): Promise<ProjectWithAnalytics> {
    throw new ValidationError('Updating projects is not supported through this repository', 'ProjectRepository.update');
  }

  /**
   * Delete operation is not supported for external projects
   */
  async delete(id: string): Promise<boolean> {
    throw new ValidationError('Deleting projects is not supported through this repository', 'ProjectRepository.delete');
  }

  /**
   * Get project analytics separately
   */
  async getProjectAnalytics(projectId: string, provider: AuthProvider): Promise<ProjectAnalytics | null> {
    const context = 'ProjectRepository.getProjectAnalytics';
    const cacheKey = `analytics:${provider}:${projectId}`;
    
    try {
      const cached = this.getCached<ProjectAnalytics>(cacheKey);
      if (cached) {
        return cached;
      }

      let analytics: ProjectAnalytics | null = null;

      if (provider === 'jira') {
        analytics = await this.getJiraAnalytics(projectId);
      } else if (provider === 'trello') {
        analytics = await this.getTrelloAnalytics(projectId);
      }

      if (analytics) {
        // Cache analytics for 10 minutes
        this.setCached(cacheKey, analytics, 600);
      }

      return analytics;
    } catch (error) {
      logger.error('Failed to get project analytics', { projectId, provider, error }, context);
      return null;
    }
  }

  /**
   * Clear cache for a specific project
   */
  invalidateProject(projectId: string): void {
    this.clearCache(`findById:${projectId}`);
    this.clearCache(`analytics:jira:${projectId}`);
    this.clearCache(`analytics:trello:${projectId}`);
    // Clear all findAll caches as they might contain this project
    this.clearCache();
  }

  // Private methods

  private async findJiraProject(projectId: string): Promise<ProjectWithAnalytics | null> {
    try {
      const response = await this.authClient.get<any>('jira', `/rest/api/3/project/${projectId}`);
      const project = this.mapJiraProject(response);
      return ValidationService.validate(ProjectWithAnalyticsSchema, project, 'ProjectRepository.findJiraProject');
    } catch (error) {
      if (error instanceof ExternalServiceError && error.statusCode === 404) {
        return null; // Project not found
      }
      throw error;
    }
  }

  private async findTrelloProject(boardId: string): Promise<ProjectWithAnalytics | null> {
    try {
      const response = await this.authClient.get<any>('trello', `/1/boards/${boardId}`);
      const project = this.mapTrelloProject(response);
      return ValidationService.validate(ProjectWithAnalyticsSchema, project, 'ProjectRepository.findTrelloProject');
    } catch (error) {
      if (error instanceof ExternalServiceError && error.statusCode === 404) {
        return null; // Board not found
      }
      throw error;
    }
  }

  private async findJiraProjects(filters: ProjectFilters): Promise<ProjectWithAnalytics[]> {
    const response = await this.authClient.get<any[]>('jira', '/rest/api/3/project');
    const projects = response.map(project => this.mapJiraProject(project));
    return ValidationService.validateArray(ProjectWithAnalyticsSchema, projects, 'ProjectRepository.findJiraProjects');
  }

  private async findTrelloProjects(filters: ProjectFilters): Promise<ProjectWithAnalytics[]> {
    const response = await this.authClient.get<any[]>('trello', '/1/members/me/boards');
    const projects = response.map(board => this.mapTrelloProject(board));
    return ValidationService.validateArray(ProjectWithAnalyticsSchema, projects, 'ProjectRepository.findTrelloProjects');
  }

  private mapJiraProject(jiraProject: any): ProjectWithAnalytics {
    return {
      id: jiraProject.id,
      key: jiraProject.key,
      name: jiraProject.name,
      projectTypeKey: jiraProject.projectTypeKey,
      avatarUrls: jiraProject.avatarUrls,
      analytics: jiraProject.analytics // May be undefined
    };
  }

  private mapTrelloProject(trelloBoard: any): ProjectWithAnalytics {
    return {
      id: trelloBoard.id,
      key: trelloBoard.shortLink,
      name: trelloBoard.name,
      projectTypeKey: 'trello',
      avatarUrls: trelloBoard.prefs?.backgroundImage ? {
        '48x48': trelloBoard.prefs.backgroundImage
      } : undefined,
      analytics: trelloBoard.analytics // May be undefined
    };
  }

  private async getJiraAnalytics(projectKey: string): Promise<ProjectAnalytics | null> {
    try {
      // Get issue counts by status category
        const searchResponse = await this.authClient.post<any>('jira', 
          `/rest/api/3/search/jql`, {
            jql: `project=${projectKey}`,
            maxResults: 0,
            fields: ['*all']
          }
      );
      
      const totalIssues = searchResponse.total || 0;
      
      // Get issues by status category
      const [openResponse, inProgressResponse, doneResponse] = await Promise.all([
          this.authClient.post<any>('jira', 
            `/rest/api/3/search/jql`, {
              jql: `project=${projectKey} AND statusCategory=new`,
              maxResults: 0
            }
        ),
          this.authClient.post<any>('jira', 
            `/rest/api/3/search/jql`, {
              jql: `project=${projectKey} AND statusCategory=indeterminate`,
              maxResults: 0
            }
        ),
          this.authClient.post<any>('jira', 
            `/rest/api/3/search/jql`, {
              jql: `project=${projectKey} AND statusCategory=done`,
              maxResults: 0
            }
        )
      ]);

      return {
        totalIssues,
        openIssues: openResponse.total || 0,
        inProgressIssues: inProgressResponse.total || 0,
        doneIssues: doneResponse.total || 0
      };
    } catch (error) {
      logger.error('Failed to get Jira analytics', { projectKey, error }, 'ProjectRepository.getJiraAnalytics');
      return null;
    }
  }

  private async getTrelloAnalytics(boardId: string): Promise<ProjectAnalytics | null> {
    try {
      const [cards, lists] = await Promise.all([
        this.authClient.get<any[]>('trello', `/1/boards/${boardId}/cards`),
        this.authClient.get<any[]>('trello', `/1/boards/${boardId}/lists`)
      ]);

      const totalIssues = cards.length;
      
      // Find done and in progress lists
      const doneList = lists.find(list => 
        list.name.toLowerCase().includes('done') || 
        list.name.toLowerCase().includes('complete')
      );
      
      const inProgressList = lists.find(list => 
        list.name.toLowerCase().includes('progress') || 
        list.name.toLowerCase().includes('doing')
      );

      const doneIssues = doneList ? cards.filter(card => card.idList === doneList.id).length : 0;
      const inProgressIssues = inProgressList ? cards.filter(card => card.idList === inProgressList.id).length : 0;
      const openIssues = totalIssues - doneIssues - inProgressIssues;

      return {
        totalIssues,
        openIssues: Math.max(0, openIssues),
        inProgressIssues,
        doneIssues
      };
    } catch (error) {
      logger.error('Failed to get Trello analytics', { boardId, error }, 'ProjectRepository.getTrelloAnalytics');
      return null;
    }
  }

  private applyFilters(projects: ProjectWithAnalytics[], filters: ProjectFilters): ProjectWithAnalytics[] {
    let filtered = projects;

    if (filters.hasAnalytics !== undefined) {
      filtered = filtered.filter(project => 
        filters.hasAnalytics ? !!project.analytics : !project.analytics
      );
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(project =>
        project.name.toLowerCase().includes(searchLower) ||
        project.key.toLowerCase().includes(searchLower)
      );
    }

    if (filters.projectTypeKey) {
      filtered = filtered.filter(project =>
        project.projectTypeKey === filters.projectTypeKey
      );
    }

    return filtered;
  }

  private sortProjects(
    projects: ProjectWithAnalytics[], 
    sortBy: string, 
    sortOrder: 'asc' | 'desc'
  ): ProjectWithAnalytics[] {
    return projects.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortBy) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'key':
          aValue = a.key.toLowerCase();
          bValue = b.key.toLowerCase();
          break;
        case 'totalIssues':
          aValue = a.analytics?.totalIssues || 0;
          bValue = b.analytics?.totalIssues || 0;
          break;
        default:
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }
} 