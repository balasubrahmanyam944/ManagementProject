import { ProjectRepository, ProjectFilters, ProjectAnalytics } from './repositories/project-repository';
import { ValidationService } from '@/lib/validation';
import { ProjectWithAnalyticsSchema, type ProjectWithAnalytics } from '@/lib/validation/schemas';
import { logger } from '@/lib/utils/logger';
import { ValidationError, ExternalServiceError } from '@/lib/errors/error-handler';
import { PaginatedResult, PaginationOptions } from './base/repository';
import { AuthProvider } from '@/lib/auth';

export interface ProjectSearchOptions {
  query?: string;
  type?: 'jira' | 'trello';
  includeAnalytics?: boolean;
  projectTypeKey?: string;
}

export interface ProjectServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  source: 'live' | 'cache' | 'fallback';
}

/**
 * Service layer for project operations
 * Handles business logic and coordinates with repositories
 */
export class ProjectService {
  private projectRepository: ProjectRepository;

  constructor() {
    this.projectRepository = new ProjectRepository();
  }

  /**
   * Get all projects with optional filtering and pagination
   */
  async getProjects(
    options: ProjectSearchOptions = {},
    pagination?: PaginationOptions
  ): Promise<ProjectServiceResult<PaginatedResult<ProjectWithAnalytics>>> {
    const context = 'ProjectService.getProjects';
    
    try {
      logger.info('Getting projects', { options, pagination }, context);
      
      const filters: ProjectFilters = {
        type: options.type,
        hasAnalytics: options.includeAnalytics,
        search: options.query,
        projectTypeKey: options.projectTypeKey
      };

      let result: PaginatedResult<ProjectWithAnalytics>;
      
      if (pagination) {
        result = await this.projectRepository.findAllPaginated(filters, pagination);
      } else {
        const projects = await this.projectRepository.findAll(filters);
        result = {
          data: projects,
          pagination: {
            page: 1,
            limit: projects.length,
            total: projects.length,
            totalPages: 1,
            hasNext: false,
            hasPrevious: false
          }
        };
      }

      // Validate the result
      const validatedProjects = result.data.map(project => 
        ValidationService.validate(ProjectWithAnalyticsSchema, project, context)
      );

      logger.info(`Successfully retrieved ${validatedProjects.length} projects`, {
        total: result.pagination.total,
        cached: false // Repository handles cache logging
      }, context);

      return {
        success: true,
        data: {
          ...result,
          data: validatedProjects
        },
        source: 'live' // Repository manages cache internally
      };
    } catch (error) {
      logger.error('Failed to get projects', { error, options }, context);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        source: 'fallback'
      };
    }
  }

  /**
   * Get a specific project by ID
   */
  async getProject(projectId: string): Promise<ProjectServiceResult<ProjectWithAnalytics>> {
    const context = 'ProjectService.getProject';
    
    try {
      if (!projectId?.trim()) {
        throw new ValidationError('Project ID is required', context);
      }

      logger.info('Getting project by ID', { projectId }, context);
      
      const project = await this.projectRepository.findById(projectId.trim());
      
      if (!project) {
        logger.warn('Project not found', { projectId }, context);
        return {
          success: false,
          error: `Project with ID "${projectId}" not found`,
          source: 'live'
        };
      }

      // Validate the project
      const validatedProject = ValidationService.validate(
        ProjectWithAnalyticsSchema, 
        project, 
        context
      );

      logger.info('Successfully retrieved project', { 
        projectId: validatedProject.id,
        projectName: validatedProject.name 
      }, context);

      return {
        success: true,
        data: validatedProject,
        source: 'live'
      };
    } catch (error) {
      logger.error('Failed to get project', { error, projectId }, context);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        source: 'fallback'
      };
    }
  }

  /**
   * Get project analytics
   */
  async getProjectAnalytics(
    projectId: string, 
    provider: AuthProvider
  ): Promise<ProjectServiceResult<ProjectAnalytics>> {
    const context = 'ProjectService.getProjectAnalytics';
    
    try {
      if (!projectId?.trim()) {
        throw new ValidationError('Project ID is required', context);
      }

      if (!provider) {
        throw new ValidationError('Provider is required', context);
      }

      logger.info('Getting project analytics', { projectId, provider }, context);
      
      const analytics = await this.projectRepository.getProjectAnalytics(
        projectId.trim(), 
        provider
      );
      
      if (!analytics) {
        logger.warn('Analytics not available', { projectId, provider }, context);
        return {
          success: false,
          error: `Analytics not available for project "${projectId}"`,
          source: 'live'
        };
      }

      logger.info('Successfully retrieved project analytics', { 
        projectId,
        provider,
        totalIssues: analytics.totalIssues 
      }, context);

      return {
        success: true,
        data: analytics,
        source: 'live'
      };
    } catch (error) {
      logger.error('Failed to get project analytics', { error, projectId, provider }, context);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        source: 'fallback'
      };
    }
  }

  /**
   * Search projects by name or key
   */
  async searchProjects(
    query: string,
    options: Omit<ProjectSearchOptions, 'query'> = {}
  ): Promise<ProjectServiceResult<ProjectWithAnalytics[]>> {
    const context = 'ProjectService.searchProjects';
    
    try {
      if (!query?.trim()) {
        throw new ValidationError('Search query is required', context);
      }

      logger.info('Searching projects', { query, options }, context);
      
      const searchOptions: ProjectSearchOptions = {
        ...options,
        query: query.trim()
      };

      const result = await this.getProjects(searchOptions);
      
      if (!result.success || !result.data) {
        return {
          success: false,
          error: result.error || 'Search failed',
          source: result.source
        };
      }

      logger.info(`Search completed`, { 
        query,
        resultsCount: result.data.data.length 
      }, context);

      return {
        success: true,
        data: result.data.data,
        source: result.source
      };
    } catch (error) {
      logger.error('Failed to search projects', { error, query }, context);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        source: 'fallback'
      };
    }
  }

  /**
   * Get projects by type (Jira or Trello)
   */
  async getProjectsByType(
    type: 'jira' | 'trello',
    pagination?: PaginationOptions
  ): Promise<ProjectServiceResult<PaginatedResult<ProjectWithAnalytics>>> {
    const context = 'ProjectService.getProjectsByType';
    
    try {
      logger.info('Getting projects by type', { type }, context);
      
      return await this.getProjects({ type }, pagination);
    } catch (error) {
      logger.error('Failed to get projects by type', { error, type }, context);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        source: 'fallback'
      };
    }
  }

  /**
   * Refresh project data (clear cache)
   */
  async refreshProject(projectId: string): Promise<ProjectServiceResult<ProjectWithAnalytics>> {
    const context = 'ProjectService.refreshProject';
    
    try {
      if (!projectId?.trim()) {
        throw new ValidationError('Project ID is required', context);
      }

      logger.info('Refreshing project data', { projectId }, context);
      
      // Clear cache for this project
      this.projectRepository.invalidateProject(projectId.trim());
      
      // Fetch fresh data
      return await this.getProject(projectId);
    } catch (error) {
      logger.error('Failed to refresh project', { error, projectId }, context);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        source: 'fallback'
      };
    }
  }

  /**
   * Get project summary statistics
   */
  async getProjectSummary(): Promise<ProjectServiceResult<{
    totalProjects: number;
    jiraProjects: number;
    trelloProjects: number;
    projectsWithAnalytics: number;
  }>> {
    const context = 'ProjectService.getProjectSummary';
    
    try {
      logger.info('Getting project summary', undefined, context);
      
      const [allProjects, jiraProjects, trelloProjects] = await Promise.all([
        this.projectRepository.findAll(),
        this.projectRepository.findAll({ type: 'jira' }),
        this.projectRepository.findAll({ type: 'trello' })
      ]);

      const projectsWithAnalytics = allProjects.filter(p => p.analytics).length;

      const summary = {
        totalProjects: allProjects.length,
        jiraProjects: jiraProjects.length,
        trelloProjects: trelloProjects.length,
        projectsWithAnalytics
      };

      logger.info('Successfully generated project summary', summary, context);

      return {
        success: true,
        data: summary,
        source: 'live'
      };
    } catch (error) {
      logger.error('Failed to get project summary', { error }, context);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        source: 'fallback'
      };
    }
  }

  /**
   * Validate project connection
   */
  async validateProjectConnection(
    projectId: string,
    provider: AuthProvider
  ): Promise<ProjectServiceResult<{ connected: boolean; lastChecked: string }>> {
    const context = 'ProjectService.validateProjectConnection';
    
    try {
      if (!projectId?.trim()) {
        throw new ValidationError('Project ID is required', context);
      }

      logger.info('Validating project connection', { projectId, provider }, context);
      
      const project = await this.projectRepository.findById(projectId.trim());
      const connected = project !== null;
      
      const result = {
        connected,
        lastChecked: new Date().toISOString()
      };

      logger.info('Project connection validated', { 
        projectId, 
        provider, 
        connected 
      }, context);

      return {
        success: true,
        data: result,
        source: 'live'
      };
    } catch (error) {
      logger.error('Failed to validate project connection', { error, projectId, provider }, context);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        source: 'fallback'
      };
    }
  }
} 