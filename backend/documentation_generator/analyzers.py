from typing import List, Dict, Any
import os
import json
from collections import Counter, defaultdict
from documentation_generator.structures import Document, RepositoryAnalysis


class RepositoryAnalyzer:
    """Repository analysis logic"""
    def analyze(self, documents: List[Document]) -> RepositoryAnalysis:
            """Comprehensive repository analysis like the deepwiki"""
            
            # Language detection
            languages = Counter()
            frameworks = set()
            architecture_patterns = set()
            key_files = []
            dependencies = []
            file_structure = defaultdict(list)
            config_files = []
            documentation_files = []
            test_files = []
            entry_points = []
            
            # Framework and technology detection patterns
            framework_patterns = {
                'react': ['react', 'jsx', 'tsx', 'next.js', 'create-react-app'],
                'vue': ['vue', 'vuex', 'nuxt'],
                'angular': ['angular', '@angular', 'ng-'],
                'svelte': ['svelte', 'sveltekit'],
                'express': ['express', 'app.js', 'server.js'],
                'django': ['django', 'models.py', 'views.py', 'settings.py'],
                'flask': ['flask', 'app.py'],
                'fastapi': ['fastapi', 'main.py'],
                'spring': ['spring', '@SpringBootApplication', 'pom.xml'],
                'rails': ['rails', 'Gemfile', 'config/routes.rb'],
                'laravel': ['laravel', 'artisan', 'composer.json'],
                'nodejs': ['package.json', 'node_modules', 'npm'],
                'python': ['requirements.txt', 'setup.py', 'pyproject.toml'],
                'docker': ['Dockerfile', 'docker-compose'],
                'kubernetes': ['k8s', 'kubernetes', '.yaml'],
                'terraform': ['.tf', 'terraform'],
                'aws': ['aws', 's3', 'lambda', 'ec2'],
                'database': ['mysql', 'postgresql', 'mongodb', 'redis'],
                'ai/ml': ['tensorflow', 'pytorch', 'scikit-learn', 'pandas', 'numpy']
            }
            
            architecture_detection = {
                'microservices': ['service', 'api', 'microservice', 'docker-compose'],
                'monolith': ['main.py', 'app.py', 'index.js', 'server.js'],
                'mvc': ['models', 'views', 'controllers', 'mvc'],
                'mvvm': ['viewmodel', 'mvvm', 'databinding'],
                'layered': ['service', 'repository', 'controller', 'dto'],
                'event-driven': ['event', 'queue', 'pub', 'sub', 'kafka'],
                'serverless': ['lambda', 'function', 'serverless', 'vercel'],
                'spa': ['single-page', 'router', 'spa'],
                'api-first': ['api', 'openapi', 'swagger', 'rest'],
                'component-based': ['component', 'widget', 'module']
            }
            
            for doc in documents:
                file_path = doc.meta_data.get('file_path', '')
                file_type = doc.meta_data.get('type', '')
                content_lower = doc.text.lower()
                
                # Count languages
                languages[file_type] += 1
                
                # Build file structure
                path_parts = file_path.split('/')
                if len(path_parts) > 1:
                    directory = '/'.join(path_parts[:-1])
                    file_structure[directory].append(path_parts[-1])
                
                # Detect key files
                filename_lower = os.path.basename(file_path).lower()
                if any(key in filename_lower for key in ['readme', 'main', 'index', 'app', 'entry', 'bootstrap']):
                    key_files.append(file_path)
                    if any(entry in filename_lower for entry in ['main', 'index', 'app', 'entry']):
                        entry_points.append(file_path)
                
                # Detect config files
                if any(config in filename_lower for config in ['config', 'settings', '.env', 'dockerfile', 'makefile', 'package.json', 'requirements.txt', 'pom.xml', 'build.gradle']):
                    config_files.append(file_path)
                
                # Detect documentation
                if any(doc_pattern in filename_lower for doc_pattern in ['readme', 'doc', 'wiki', 'guide', 'tutorial', 'changelog']):
                    documentation_files.append(file_path)
                
                # Detect test files
                if any(test_pattern in filename_lower for test_pattern in ['test', 'spec', '__test__', '.test.', '.spec.']):
                    test_files.append(file_path)
                
                # Framework detection
                for framework, patterns in framework_patterns.items():
                    if any(pattern in content_lower or pattern in file_path.lower() for pattern in patterns):
                        frameworks.add(framework)
                
                # Architecture pattern detection
                for pattern, indicators in architecture_detection.items():
                    if any(indicator in content_lower or indicator in file_path.lower() for indicator in indicators):
                        architecture_patterns.add(pattern)
                
                # Extract dependencies (simplified)
                if 'package.json' in file_path:
                    try:
                        package_data = json.loads(doc.text)
                        if 'dependencies' in package_data:
                            dependencies.extend(package_data['dependencies'].keys())
                    except:
                        pass
                elif 'requirements.txt' in file_path:
                    dependencies.extend([line.split('==')[0].split('>=')[0].strip() 
                                    for line in doc.text.split('\n') if line.strip()])
            
            # Calculate complexity score
            complexity_score = self._calculate_complexity_score(languages, frameworks, file_structure)
            
            # Determine domain type
            domain_type = self._determine_domain_type(frameworks, dependencies)
            
            # Build tech stack
            tech_stack = list(frameworks) + list(languages.keys())[:5]
            
            #rag based implementation not there

            return RepositoryAnalysis(
                languages=dict(languages.most_common()),
                frameworks=list(frameworks),
                architecture_patterns=list(architecture_patterns),
                key_files=key_files[:10],
                dependencies=dependencies[:20],
                file_structure=dict(file_structure),
                complexity_score=complexity_score,
                domain_type=domain_type,
                tech_stack=tech_stack,
                entry_points=entry_points,
                config_files=config_files[:10],
                documentation_files=documentation_files[:10],
                test_files=test_files[:10]
            )
    def _calculate_complexity_score(self, languages: Counter, frameworks: set, file_structure: dict) -> int:
        """Calculate repository complexity score (1-10) - EXACT SAME"""
        score = 1
        
        # Language diversity
        score += len(languages) * 0.5
        
        # Framework complexity
        score += len(frameworks) * 0.8
        
        # Directory depth
        max_depth = max([len(path.split('/')) for path in file_structure.keys()] or [1])
        score += max_depth * 0.3
        
        # Total files
        total_files = sum(languages.values())
        if total_files > 100:
            score += 2
        elif total_files > 50:
            score += 1
        
        return min(10, int(score))

    def _determine_domain_type(self, frameworks: set, dependencies: list) -> str:
        """Determine the primary domain/type of the repository - EXACT SAME"""
        if any(ai in str(frameworks) + str(dependencies) for ai in ['tensorflow', 'pytorch', 'scikit-learn', 'ml', 'ai']):
            return 'AI/ML'
        elif any(web in frameworks for web in ['react', 'vue', 'angular', 'express', 'django', 'flask']):
            return 'Web Development'
        elif any(mobile in str(dependencies) for mobile in ['react-native', 'flutter', 'ionic']):
            return 'Mobile Development'
        elif any(data in str(dependencies) for data in ['pandas', 'numpy', 'data', 'analytics']):
            return 'Data Science'
        elif any(devops in frameworks for devops in ['docker', 'kubernetes', 'terraform']):
            return 'DevOps'
        elif any(game in str(dependencies) for game in ['unity', 'game', 'engine']):
            return 'Game Development'
        elif any(blockchain in str(dependencies) for blockchain in ['web3', 'ethereum', 'solidity']):
            return 'Blockchain'
        else:
            return 'General Software'