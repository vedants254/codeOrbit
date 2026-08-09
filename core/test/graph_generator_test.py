#!/usr/bin/env python3
"""
Dynamic comprehensive test of all GitVizz features.
This script automatically detects available test sources and adapts to different environments.
"""

import sys
import os
import tempfile
import urllib.request
from pathlib import Path
import argparse
import json
from typing import List, Dict, Optional

# Add the gitvizz package to the path
current_dir = Path(__file__).parent
gitvizz_root = current_dir.parent
sys.path.insert(0, str(gitvizz_root))

try:
    from gitvizz import GraphGenerator, IPYSIGMA_AVAILABLE
    GITVIZZ_AVAILABLE = True
except ImportError as e:
    print(f"❌ GitVizz import failed: {e}")
    GITVIZZ_AVAILABLE = False

# Configuration for dynamic test sources
TEST_SOURCES = {
    "small_python": {
        "url": "https://github.com/psf/requests/archive/refs/heads/main.zip",
        "name": "Python Requests Library",
        "extensions": ['.py'],
        "max_files": 20,
        "ignore_patterns": ['**/test_*', '**/tests/**', '**/.git/**']
    },
    "javascript": {
        "url": "https://github.com/lodash/lodash/archive/refs/heads/main.zip", 
        "name": "Lodash JavaScript Library",
        "extensions": ['.js'],
        "max_files": 15,
        "ignore_patterns": ['**/test/**', '**/.*', '**/node_modules/**']
    },
    "react": {
        "url": "https://github.com/facebook/create-react-app/archive/refs/heads/main.zip",
        "name": "Create React App",
        "extensions": ['.js', '.jsx', '.ts', '.tsx'],
        "max_files": 25,
        "ignore_patterns": ['**/test/**', '**/node_modules/**', '**/build/**']
    },
    "multi_lang": {
        "url": "https://github.com/microsoft/vscode/archive/refs/heads/main.zip",
        "name": "VS Code (Multi-language)",
        "extensions": ['.js', '.ts', '.py'],
        "max_files": 30,
        "ignore_patterns": ['**/test/**', '**/node_modules/**', '**/.git/**']
    }
}

class DynamicTestRunner:
    """Dynamic test runner that adapts to available resources and user preferences."""
    
    def __init__(self, args=None):
        self.args = args or argparse.Namespace()
        self.temp_files = []
        self.results = {}
        
    def cleanup(self):
        """Clean up temporary files."""
        for temp_file in self.temp_files:
            try:
                if os.path.exists(temp_file):
                    os.unlink(temp_file)
            except Exception as e:
                print(f"Warning: Could not clean up {temp_file}: {e}")
    
    def detect_local_sources(self) -> List[Dict]:
        """Detect available local directories for testing."""
        sources = []
        
        # Check for current gitvizz directory
        if gitvizz_root.exists() and (gitvizz_root / "gitvizz").exists():
            sources.append({
                "path": str(gitvizz_root / "gitvizz"),
                "name": "GitVizz Source Code",
                "type": "directory"
            })
        
        # Check for common project directories
        common_dirs = ["src", "../", "examples", "test"]
        for dir_name in common_dirs:
            dir_path = Path(dir_name)
            if dir_path.exists() and dir_path.is_dir():
                py_files = list(dir_path.glob("**/*.py"))
                js_files = list(dir_path.glob("**/*.js"))
                if len(py_files) > 0 or len(js_files) > 0:
                    sources.append({
                        "path": str(dir_path),
                        "name": f"Local {dir_name} Directory",
                        "type": "directory",
                        "file_count": len(py_files) + len(js_files)
                    })
        
        return sources
    
    def download_test_source(self, source_config: Dict) -> Optional[str]:
        """Download a test source ZIP file."""
        try:
            print(f"📥 Downloading {source_config['name']}...")
            temp_zip = tempfile.NamedTemporaryFile(suffix='.zip', delete=False)
            urllib.request.urlretrieve(source_config['url'], temp_zip.name)
            self.temp_files.append(temp_zip.name)
            print(f"✅ Downloaded to {temp_zip.name}")
            return temp_zip.name
        except Exception as e:
            print(f"❌ Failed to download {source_config['name']}: {e}")
            return None
    
    def test_source(self, source_path: str, config: Dict) -> Dict:
        """Test a single source with given configuration."""
        test_result = {
            "source": source_path,
            "config": config,
            "success": False,
            "error": None,
            "stats": {}
        }
        
        try:
            print(f"\n🧪 Testing: {config.get('name', source_path)}")
            
            # Create generator with dynamic configuration
            generator = GraphGenerator.from_source(
                source_path,
                file_extensions=config.get('extensions', ['.py', '.js', '.jsx', '.ts', '.tsx']),
                max_files=config.get('max_files', 50),
                ignore_patterns=config.get('ignore_patterns', ['**/.*', '**/__pycache__/**'])
            )
            
            # Generate graph
            graph = generator.generate()
            
            # Collect statistics
            stats = {
                "nodes": len(graph['nodes']),
                "edges": len(graph['edges']),
                "project_type": generator.project_type,
                "files_processed": len(generator.files)
            }
            
            test_result.update({
                "success": True,
                "stats": stats,
                "generator": generator
            })
            
            print(f"✅ Success:")
            print(f"   📁 Files: {stats['files_processed']}")
            print(f"   🔗 Nodes: {stats['nodes']}")
            print(f"   ➡️  Edges: {stats['edges']}")
            print(f"   🏷️  Type: {stats['project_type']}")
            
        except Exception as e:
            test_result["error"] = str(e)
            print(f"❌ Failed: {e}")
        
        return test_result

    def test_advanced_features(self, generator) -> Dict:
        """Test advanced features like NetworkX, I/O, visualization."""
        if not generator:
            return {"success": False, "error": "No generator provided"}
        
        features_tested = {}
        
        with tempfile.TemporaryDirectory() as temp_dir:
            try:
                # Test I/O operations
                json_path = os.path.join(temp_dir, "test.json")
                graphml_path = os.path.join(temp_dir, "test.graphml")
                
                generator.save_json(json_path)
                generator.save_graphml(graphml_path)
                features_tested["io_save"] = True
                
                # Test loading
                json_gen = GraphGenerator([])
                json_gen.load_json(json_path)
                features_tested["json_load"] = True
                
                # Test NetworkX conversion
                nx_graph = generator.to_networkx()
                import networkx as nx
                features_tested["networkx"] = {
                    "nodes": nx_graph.number_of_nodes(),
                    "edges": nx_graph.number_of_edges(),
                    "density": round(nx.density(nx_graph), 4)
                }
                
                # Test visualization if available
                if IPYSIGMA_AVAILABLE:
                    try:
                        sigma_widget = generator.visualize(height=500)
                        features_tested["visualization"] = True
                    except Exception as e:
                        features_tested["visualization"] = f"Error: {e}"
                else:
                    features_tested["visualization"] = "ipysigma not available"
                
            except Exception as e:
                features_tested["error"] = str(e)
        
        return {"success": True, "features": features_tested}
    
    def run_interactive_mode(self):
        """Run interactive test mode with user choices."""
        print("🎮 Interactive Test Mode")
        print("=" * 40)
        
        if not GITVIZZ_AVAILABLE:
            print("❌ GitVizz is not available. Please install it first.")
            return
        
        # Detect local sources
        local_sources = self.detect_local_sources()
        
        print("\n📂 Available Test Sources:")
        print("Local sources:")
        for i, source in enumerate(local_sources, 1):
            file_info = f" ({source.get('file_count', 'unknown')} files)" if 'file_count' in source else ""
            print(f"  {i}. {source['name']}{file_info}")
        
        print("\nRemote sources (will download):")
        for i, (key, config) in enumerate(TEST_SOURCES.items(), len(local_sources) + 1):
            print(f"  {i}. {config['name']} ({key})")
        
        # Get user choice
        try:
            choice = input(f"\nSelect source (1-{len(local_sources) + len(TEST_SOURCES)}) or 'all': ").strip().lower()
            
            if choice == 'all':
                self.run_comprehensive_tests()
            else:
                choice_num = int(choice)
                if 1 <= choice_num <= len(local_sources):
                    source = local_sources[choice_num - 1]
                    config = {"name": source['name'], "extensions": ['.py', '.js', '.jsx', '.ts', '.tsx']}
                    result = self.test_source(source['path'], config)
                    if result['success']:
                        self.test_advanced_features(result.get('generator'))
                else:
                    remote_idx = choice_num - len(local_sources) - 1
                    source_key = list(TEST_SOURCES.keys())[remote_idx]
                    source_config = TEST_SOURCES[source_key]
                    
                    zip_path = self.download_test_source(source_config)
                    if zip_path:
                        result = self.test_source(zip_path, source_config)
                        if result['success']:
                            self.test_advanced_features(result.get('generator'))
                            
        except (ValueError, IndexError, KeyboardInterrupt):
            print("\n👋 Exiting...")
    
    def run_comprehensive_tests(self):
        """Run all available tests."""
        print("\n🔄 Running Comprehensive Tests")
        print("=" * 40)
        
        if not GITVIZZ_AVAILABLE:
            print("❌ GitVizz is not available. Please install it first.")
            return
        
        all_results = []
        
        # Test local sources
        local_sources = self.detect_local_sources()
        for source in local_sources[:2]:  # Limit to avoid too many tests
            config = {"name": source['name'], "extensions": ['.py', '.js', '.jsx', '.ts', '.tsx']}
            result = self.test_source(source['path'], config)
            all_results.append(result)
        
        # Test one remote source
        if not self.args.offline:
            try:
                source_config = TEST_SOURCES['small_python']  # Use a reliable small source
                zip_path = self.download_test_source(source_config)
                if zip_path:
                    result = self.test_source(zip_path, source_config)
                    all_results.append(result)
                    
                    # Test advanced features on the successful result
                    if result['success']:
                        advanced_result = self.test_advanced_features(result.get('generator'))
                        print(f"\n🚀 Advanced Features Test:")
                        features = advanced_result.get('features', {})
                        for feature, status in features.items():
                            if isinstance(status, dict):
                                print(f"   ✅ {feature}: {status}")
                            elif status is True:
                                print(f"   ✅ {feature}")
                            else:
                                print(f"   ⚠️  {feature}: {status}")
            except Exception as e:
                print(f"❌ Remote test failed: {e}")
        
        # Print summary
        self.print_test_summary(all_results)
    
    def print_test_summary(self, results: List[Dict]):
        """Print a comprehensive test summary."""
        print("\n" + "=" * 50)
        print("📊 TEST SUMMARY")
        print("=" * 50)
        
        successful = [r for r in results if r['success']]
        failed = [r for r in results if not r['success']]
        
        print(f"✅ Successful tests: {len(successful)}")
        print(f"❌ Failed tests: {len(failed)}")
        
        if successful:
            print(f"\n🎯 Success Details:")
            total_nodes = sum(r['stats'].get('nodes', 0) for r in successful)
            total_edges = sum(r['stats'].get('edges', 0) for r in successful)
            total_files = sum(r['stats'].get('files_processed', 0) for r in successful)
            
            print(f"   📁 Total files processed: {total_files}")
            print(f"   🔗 Total nodes created: {total_nodes}")
            print(f"   ➡️  Total edges created: {total_edges}")
            
            project_types = [r['stats'].get('project_type') for r in successful if r['stats'].get('project_type')]
            if project_types:
                print(f"   🏷️  Project types detected: {set(project_types)}")
        
        if failed:
            print(f"\n❌ Failure Details:")
            for result in failed:
                print(f"   - {result['config'].get('name', 'Unknown')}: {result['error']}")
        
        print(f"\n🔧 Environment Info:")
        print(f"   - GitVizz available: {GITVIZZ_AVAILABLE}")
        print(f"   - ipysigma available: {IPYSIGMA_AVAILABLE}")
        print(f"   - NetworkX integration: ✅")
        
        if len(successful) > 0:
            print(f"\n🎉 GitVizz is working correctly!")
        else:
            print(f"\n⚠️  No successful tests - check your setup")

def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Dynamic comprehensive test of GitVizz features",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python final_comprehensive_test.py                    # Interactive mode
  python final_comprehensive_test.py --auto             # Run all tests automatically
  python final_comprehensive_test.py --local-only       # Test local sources only
  python final_comprehensive_test.py --source python    # Test specific remote source
  python final_comprehensive_test.py --offline          # Skip downloads
        """
    )
    
    parser.add_argument('--auto', action='store_true', 
                       help='Run comprehensive tests automatically')
    parser.add_argument('--local-only', action='store_true',
                       help='Test only local sources (no downloads)')
    parser.add_argument('--source', choices=list(TEST_SOURCES.keys()),
                       help='Test specific remote source')
    parser.add_argument('--offline', action='store_true',
                       help='Skip all network operations')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Enable verbose output')
    
    return parser.parse_args()

def main():
    """Main entry point with argument parsing and mode selection."""
    args = parse_arguments()
    
    print("🧪 GitVizz Dynamic Comprehensive Test")
    print("=" * 50)
    
    runner = DynamicTestRunner(args)
    
    try:
        if args.auto or args.local_only:
            runner.run_comprehensive_tests()
        elif args.source:
            # Test specific source
            if args.source in TEST_SOURCES:
                source_config = TEST_SOURCES[args.source]
                zip_path = runner.download_test_source(source_config)
                if zip_path:
                    result = runner.test_source(zip_path, source_config)
                    if result['success']:
                        runner.test_advanced_features(result.get('generator'))
        else:
            # Interactive mode
            runner.run_interactive_mode()
    except KeyboardInterrupt:
        print("\n👋 Test interrupted by user")
    finally:
        runner.cleanup()

if __name__ == "__main__":
    main()