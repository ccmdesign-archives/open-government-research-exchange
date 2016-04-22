var
gulp            = require('gulp'),
util            = require('gulp-util'),
sass            = require('gulp-sass'),
shell           = require('gulp-shell'),
data            = require('gulp-data'),
nunjucksRender  = require('gulp-nunjucks-render'),
plumber         = require('gulp-plumber'),
yaml            = require('gulp-yaml'),
flatten         = require('gulp-flatten'),
intercept       = require('gulp-intercept'),
csv2json        = require('gulp-csv2json'),
rename          = require('gulp-rename'),
gulpFn          = require('gulp-fn'),
gulpFile        = require('gulp-file'),
colors          = require('colors'),
bs              = require('browser-sync').create(),
bs2             = require('browser-sync').create(), // why is this needed?
minimist        = require('minimist'),
File            = require('vinyl'),
es              = require('event-stream'),
fs              = require('fs'),
md5             = require('md5'),
lunr            = require('lunr'),
packagejson     = require('./package.json')
;

// define options & configuration ///////////////////////////////////

// get arguments from command line
var argv = minimist(process.argv.slice(2));

// command line options (usage: gulp --optionname)
var cliOptions = {
  diff      : false || argv.diff,
  verbose   : false || argv.verbose,
  nosync    : false || argv.nosync
};

// column mapping for csv to json conversion
var COL_NAME_MAP = {
  'Publication Name'      : 'title',
  'Open vs. Closed Access': 'access',
  'Organization'          : { value : 'organization', slugify : true },
  'Authors'               : { value : 'authors', children : ['*'], delimiter : ',' },
  'Image or Screenshot'   : 'cover_image',
  'Published On'          : 'paper_date',
  'Submitted On'          : 'submission_date',
  'Link to download'      : 'url',
  'Sector'                : { value : 'sector', children : ['*'], delimiter : ',' },
  'Region'                : { value : 'region', children : ['*'], delimiter : ',' },
  'Publication Type'      : { value : 'type', slugify : true },
  'Tool/Project'          : { value : 'tools', children : ['*'], delimiter : ',' },
  'GitHub Repository'     : 'github',
  'Abstract'              : 'abstract',
  'Content URL'           : 'html_content',
  'Subset'                : 'subset',
  'Tags'                  : 'tags',
  'Innovation'            : { parent : 'taxonomy', value : 'category', children : ['*'], delimiter : ',' },
  'Methodology'           : { parent : 'taxonomy', value : 'methodology', children : ['*'], delimiter : ',' },
  'Objective'             : { parent : 'taxonomy', value : 'objective', children : ['*'], delimiter : ',' },
  'Dataset Name'          : { parent : 'datasets', value : 'name', many : true, delimiter : ';' },
  'Dataset URL'           : { parent : 'datasets', value : 'url', many : true, delimiter : ';' },
  'Related Content Title' : { parent : 'related_content', value : 'title', many : true, delimiter : ';' },
  'Related Content URL'   : { parent : 'related_content', value : 'url', many : true, delimiter : ';' },
  'PDF URL'               : { parent : 'direct_download', value : 'pdf' },
  'Word URL'              : { parent : 'direct_download', value : 'word' },
  'Mobi URL'              : { parent : 'direct_download', value : 'mobi' },
  'ePub URL'              : { parent : 'direct_download', value : 'epub' },
  'Other URL'             : { parent : 'direct_download', value : 'other', children : ['url', 'name'], delimiter : ' ' }
};

// whitelist for generating subsets of json data
// containing all possible values of each property in this list
// this could be integrated into COL_NAME_MAP later
var SUB_DATASETS = [
'access',
'organization',
'authors',
'sector',
'region',
'type',
'tools',
['taxonomy', 'category'],
['taxonomy', 'methodology'],
['taxonomy', 'objective']
]

// gulpfile options
var options = {
  path: './source/templates/', // base path to templates
  dataPath: './source/data/', // base path to datasets
  ext: '.html', // extension to use for templates
  dataExt: '.json', // extension to use for data
  manageEnv: nunjucksEnv, // function to manage nunjucks environment
  libraryPath: 'node_modules/govlab-styleguide/dist/', // path to installed sass/js library distro folder
  defaultData: './source/data/default.json' // default dataset to use if no automatically generated template is found
};

// initialize browsersync
gulp.task('bs', function() {
  if (!cliOptions.nosync) {
    bs.init({
      server: 'public',
      open: false
    });
  }
});

// Compile sass into CSS & auto-inject into browsers
// gulp.task('sass', function() {
//     return gulp.src("app/scss/*.scss")
//         .pipe(sass())
//         .pipe(gulp.dest("app/css"))
//         .pipe(browserSync.stream());
// });

// define custom functions ///////////////////////////////////

// converts string t to a slug (eg 'Some Text Here' becomes 'some-text-here')
function slugify(t) {
  return t ? t.toString().toLowerCase()
  .replace(/\s+/g, '-')
  .replace(/[^\w\-]+/g, '')
  .replace(/\-\-+/g, '-')
  .replace(/^-+/, '')
  .replace(/-+$/, '')
  : false ;
}

function split(s, delim) {
  return s ? s.toString().split(delim) : false;
}

//check if an item an arr2 exists in arr1
function containsAny(arr1, arr2) {

  if (typeof arr2 === "string") {
    arr2 = arr2.split();
  } else if (arr2 === false ) {
    return false;
  }
  return arr2.some(function(value) {
    return arr1.indexOf(value) > -1;
  });
}

// return a matched set of objects containing property (prop) with value (value)
// if prop is an array, treat it as dot syntax
function matchObjects(arr, prop, value) {
  var matches = [], o;

  for (var obj in arr) {
    // default to assuming prop is not an array
    o = arr[obj];
    p = prop;

    // if prop is an array, scope o[p] to be equivalent to the dot syntax of each element in the array
    // e.g. o[p] == obj.prop[0].prop[1] ...
    if (Array.isArray(prop)) {
      var i;
      for (i = 0; i < prop.length-1; i++) {
        o = o[prop[i]];
      }
      p = prop[i];
    }

    // push anything that either is an array that contains value, or equals value to matches
    if (o.hasOwnProperty(p)) {
      if (Array.isArray(o[p])) {
        o[p].indexOf(value) > -1 && matches.push(arr[obj]);
      } else {
        o[p] === value && matches.push(arr[obj]);
      }
    }
  }

  return matches;
}

// push v to array arr if it is not already present in arr
//
function pushIfNew(arr, v) {
  if (arr.indexOf(v) === -1) {
    arr.push(v);
  }
  return arr;
}

// push all unique values of a certain property (prop) to an array and return that array
// in a particular category
function pushPossibleValues(arr, obj, prop, category, prefix) {
  prefix = prefix === undefined ? false : prefix;

  if (obj.taxonomy.category && obj.taxonomy.category.indexOf(category) > -1) {
    var v = prefix ? obj[prefix][slugify(prop)] : obj[slugify(prop)] ;

    if (v) {
      if (Array.isArray(v)) {
        for (i in v) {
          pushIfNew(arr, v[i]);
        }
      } else {
        pushIfNew(arr, v);
      }
    }
  }

  return arr;
}

// get all unique values of a certain property (prop) in all objects in array (arr)
function getUniqueValues(arr, prop) {
  var values = [], o, p, v;

  for (var obj in arr) {
    // default to assuming prop is not an array
    o = arr[obj];
    p = prop;

    // if prop is an array, scope o[p] to be equivalent to the dot syntax of each element in the array
    // e.g. o[p] == obj.prop[0].prop[1] ...
    if (Array.isArray(prop)) {
      var i;
      for (i = 0; i < prop.length-1; i++) {
        o = o[prop[i]];
      }
      p = prop[i];
    }

    v = o[p];

    // push anything that either is an array that contains value, or equals value to matches
    if (v) {
      if (Array.isArray(v)) {
        for (i in v) {
          pushIfNew(values, v[i]);
        }
      } else {
        pushIfNew(values, v);
      }
    }
  }

  return values;
}

// set up nunjucks environment
function nunjucksEnv(env) {
  env.addFilter('slug', slugify);
  env.addFilter('split', split);
  env.addFilter('containsAny', containsAny);
}

// a subroutine to simplify processJson
function populateChildren(out, content, val, index) {
  if ('children' in val) {
    // convert boolean false to '' and anything else to a string
    content === false && (content = '');
    typeof content !== 'string' && (content = String(content));

    var _s = content.split(val.delimiter);
    if ('parent' in val) {
      out[index][val.parent][val.value] = val.children[0] === '*' ? [] : {};
    } else {
      out[index][val.value] = val.children[0] === '*' ? [] : {};
    }

    if (val.children[0] === '*') {
      for (var s in _s) {
        if ('parent' in val) {
          out[index][val.parent][val.value].push(_s[s].trim());
        } else {
          out[index][val.value].push(_s[s].trim());
        }
      }
    } else {
      for (var k in val.children) {
        if (k < _s.length) {
          if ('parent' in val) {
            out[index][val.parent][val.value][val.children[k]] = _s[k].trim();
          } else {
            out[index][val.value][val.children[k]] = _s[k].trim();
          }
        }
      }
    }
  } else {
    if ('parent' in val) {
      out[index][val.parent][val.value] = content;
    } else {
      out[index][val.value] = content;
    }
  }
  return out;
}

// process csv for the research repo into json based on source/support/schema.json
function processJSON ( file ) {
  'use strict';
  var _json = JSON.parse(file.contents.toString());
  var _jsonOut = [];
  for (var i in _json) {
    _jsonOut[i] = {};
    _jsonOut[i].id = md5(i.toString());

    for (var j in _json[i]) {

      if (j in COL_NAME_MAP) {
        var v = COL_NAME_MAP[j];

        if (typeof v === 'object') {

          var content = _json[i][j];

          if (v.slugify) {
            content = slugify(content);
          }

          if ('parent' in v) {
            if (!(v.parent in _jsonOut[i])) {
              _jsonOut[i][v.parent] = v.many ? [] : {};
            }

            if (v.many) {
              var _split = content.split(v.delimiter);

              for (var s in _split) {
                if (_jsonOut[i][v.parent].length == 0) {
                  let a = v.value;
                  let b = {};
                  b[a]  = '';
                  _jsonOut[i][v.parent][s] = b;
                }
                _jsonOut[i][v.parent][s][v.value] = _split[s].trim();
              }
            }
          }

          _jsonOut = populateChildren(_jsonOut, content, v, i);

        } else {
          _jsonOut[i][v] = _json[i][j];
        }
      }
    }
  }
  var out = JSON.stringify(_jsonOut);
  file.contents = new Buffer(out);
}

// compile all the datasets into a composite set
// for injection into nunjucks using gulp-data
var generatedData = {};

function compileData(dataPath, ext) {
  dataPath = dataPath === undefined ? options.dataPath : dataPath;
  ext = ext === undefined ? options.dataExt : ext;
  var dataDir = fs.readdirSync(dataPath),
  baseName, r, _data;

  // look for a data file matching the naming convention
  r = new RegExp('\\' + ext + '$');
  for (var dataset in dataDir) {
    if (r.test(dataDir[dataset])) {

      // trim basename
      baseName = dataDir[dataset].replace(new RegExp('\\' + ext + '$'), '');

      // add JSON to object
      _data = require(dataPath + dataDir[dataset]).data;
      generatedData[baseName] = _data;
    }
  }
}

// generate a stream of one or more vinyl files from a json data source
// containing the parent template specified by templatePath
// which can then be piped into nunjucks to create output with data scoped to the datum
function generateVinyl(basePath, dataPath, fPrefix, fSuffix, dSuffix) {
  var files = [], r, r2, f, baseTemplate, baseName, _data, fname,
  base = fs.readdirSync(basePath);

  // stupid code courtesy of node doesnt support default parameters as of v5
  fPrefix = fPrefix === undefined ? '' : fPrefix;
  fSuffix = fSuffix === undefined ? options.ext : fSuffix;
  dSuffix = dSuffix === undefined ? options.dataExt : dSuffix;

  // compile datasets
  compileData(dataPath, dSuffix);

  for (var template in base) {
    // match a filename starting with '__' and ending with the file suffix
    r = new RegExp('^__[^.]*\\' + fSuffix + '$');
    if (r.test(base[template])) {
      // read the file in as our base template
      baseTemplate = fs.readFileSync(basePath + base[template]);

      // strip __ and extension to get base naming convention
      baseName = base[template]
      .replace(/^__/, '')
      .replace(new RegExp('\\' + fSuffix + '$'), '')
      ;

      // create a new dir for the output if it doesn't already exist
      // based on naming convention
      if (!fs.existsSync(basePath + baseName)){
        fs.mkdirSync(basePath + baseName);
      }

      // look for a dataset matching the naming convention
      for (var dataset in generatedData) {
        if (dataset === baseName) {

          _data = generatedData[dataset];

          // create a new vinyl file for each datum in _data and push to files
          // using directory based on naming convention and base template as content
          for (var d in _data) {
            if (_data[d].hasOwnProperty('title')) {
              // name file if title exists
              fname = '-' + slugify(_data[d].title);
            } else {
              // otherwise just use id
              fname = '';
            }
            f = new File({
              base: basePath,
              path: basePath + baseName + '/' + fPrefix + _data[d].id + fname + fSuffix,
              contents: baseTemplate
            });
            files.push(f);
          }
        }
      }
    }
  }

  // convert files array to stream and return
  return require('stream').Readable({ objectMode: true }).wrap(es.readArray(files));
}

// define gulp tasks ///////////////////////////////////

gulp.task('sass', function() {
  return gulp.src('source/sass/styles.scss')
  .pipe(sass().on('error', sass.logError))
  .pipe(gulp.dest('public/css'))
  .pipe(bs2.stream());
  // .pipe(cliOptions.nosync ? bs.stream() : util.noop());
});

gulp.task('libCss', function() {
  return gulp.src(options.libraryPath + 'css/**/*')
  .pipe(plumber())
  .pipe(gulp.dest('source/css/lib'))
  .pipe(gulp.dest('public/css/lib'));
});

gulp.task('libJs', function() {
  return gulp.src(options.libraryPath + 'js/**/*')
  .pipe(plumber())
  .pipe(gulp.dest('source/js/lib'));
});

gulp.task('js', ['libJs'], function() {
  return gulp.src('source/js/**/*')
  .pipe(plumber())
  .pipe(gulp.dest('public/js'))
  .pipe(cliOptions.nosync ? bs.stream() : util.noop());
});

gulp.task('img', function() {
  return gulp.src('source/img/**/*')
  .pipe(plumber())
  .pipe(gulp.dest('public/img'))
  .pipe(cliOptions.nosync ? bs.stream() : util.noop());
});

gulp.task('yaml', function () {
  return gulp.src('source/data/**/*.+(yaml|yml)')
  .pipe(yaml())
  .pipe(gulp.dest('source/data'));
});

gulp.task('json', ['yaml'], function () {
  return gulp.src('source/data/**/*.json')
  .pipe(intercept(function(file){
    var o = JSON.parse(file.contents.toString()),
    b = {};
    if (!o.hasOwnProperty('data')) {
      // wrap json in a top level property 'data'
      b.data = o;
      // assign a unique id to each entry in data
      for (var j in b.data) {
        if (!b.data[j].hasOwnProperty('id')) {
          if (b.data[j].hasOwnProperty('title')) {
            // use title to create hash if exists,
            b.data[j].id = md5(b.data[j].title);
            // otherwise use first prop
          } else {
            b.data[j].id = md5(b.data[j][Object.keys(b.data[j])[0]]);
          }
        }
      }
      if (cliOptions.verbose) {
        util.log(util.colors.magenta('Converting yaml ' + file.path), 'to json as', util.colors.blue(JSON.stringify(b)));
      }
      file.contents = new Buffer(JSON.stringify(b));
    }
    return file;
  }))
  .pipe(gulp.dest('source/data'));
});

gulp.task('generateTemplates', ['json-subsets'], function() {
  return generateVinyl(options.path, options.dataPath)
  .pipe(gulp.dest(options.path))
});

gulp.task('nunjucks', ['generateTemplates'], function() {
  var filters = {
    all: {
      organizations: [],
      objectives: [],
      methodologies: [],
      sectors: [],
      regions: [],
      types: []
    }
  };

  for (var i in generatedData.categories) {
    var category = slugify(generatedData.categories[i].custom_filter)

    if (category) {
      filters[category] = {
        organizations: [],
        objectives: [],
        methodologies: [],
        sectors: [],
        regions: [],
        types: []
      }
    }
  }

  for (var i in generatedData.papers) {
    var paper = generatedData.papers[i];

    for (var j in paper.taxonomy.category) {
      var category = slugify(paper.taxonomy.category[j]);

      if (paper.organization) {
        if (filters[category] && filters[category].organizations.indexOf(paper.organization) < 0) {
          filters[category].organizations.push(paper.organization);
        }
        if (filters.all.organizations.indexOf(paper.organization) < 0) {
          filters.all.organizations.push(paper.organization);
        }
      }

      for (var k in paper.taxonomy.objective) {
        var objective = paper.taxonomy.objective[k];

        if (objective) {
          if (filters[category] && filters[category].objectives.indexOf(objective) < 0) {
            filters[category].objectives.push(objective);
          }
          if (filters.all.objectives.indexOf(objective) < 0) {
            filters.all.objectives.push(objective);
          }
        }
      }

      for (var k in paper.taxonomy.methodology) {
        var methodology = paper.taxonomy.methodology[k];

        if (methodology) {
          if (filters[category] && filters[category].methodologies.indexOf(methodology) < 0) {
            filters[category].methodologies.push(methodology);
          }
          if (filters.all.methodologies.indexOf(methodology) < 0) {
            filters.all.methodologies.push(methodology);
          }
        }
      }

      if (paper.sector) {
        if (filters[category] && filters[category].sectors.indexOf(paper.sector) < 0) {
          filters[category].sectors.push(paper.sector);
        }
        if (filters.all.sectors.indexOf(paper.sector) < 0) {
          filters.all.sectors.push(paper.sector);
        }
      }

      if (paper.region) {
        if (filters[category] && filters[category].regions.indexOf(paper.region) < 0) {
          filters[category].regions.push(paper.region);
        }
        if (filters.all.regions.indexOf(paper.region) < 0) {
          filters.all.regions.push(paper.region);
        }
      }

      if (paper.type) {
        if (filters[category] && filters[category].types.indexOf(paper.type) < 0) {
          filters[category].types.push(paper.type);
        }
        if (filters.all.types.indexOf(paper.type) < 0) {
          filters.all.types.push(paper.type);
        }
      }
    }
  }

  return gulp.src( options.path + '**/*' + options.ext )
  .pipe(plumber())
  .pipe(data(function(file) {
    // check if the file is an auto generated file
    // filename must contain a unique id which must also be present in the data as 'id'
    for (var datasetName in generatedData) {
      for (var i in generatedData[datasetName]) {
        var r = new RegExp(datasetName + '\\/' + generatedData[datasetName][i].id)
        if (r.test(file.path)) {
          if (cliOptions.verbose) {
            util.log(util.colors.green('Found Generated Template ' + file.path), ': using', JSON.stringify(generatedData[datasetName][i]));
          }
          // return data matching id in dataset datasetName
          var d = generatedData[datasetName][i];
          // add all datasets as special prop $global
          d.$global = generatedData;
          d.$global.filters = filters;
          return d;
        }
      }
    }
    // if no id is found, return the whole data cache
    // this will then be available in nunjucks as [jsonfilename].[key].[etc]
    return generatedData;
  }))
  .pipe(nunjucksRender(options))
  .pipe(flatten())
  .pipe(gulp.dest('public'));
});

gulp.task('csv2json', function() {
  var options = {};
  return gulp.src('source/support/**.csv')
  .pipe(csv2json(options))
  .pipe(gulpFn(processJSON))
  .pipe(rename(function (path) {
    path.extname = ".json"
  }))
  .pipe(gulp.dest('source/data'))
});

gulp.task('json-subsets', ['json'], function () {
  compileData();

  var _stream = gulpFile('noop.json', JSON.stringify({
    foo: 'bar'
  }), { src: true });

  for (var subset in SUB_DATASETS) {
    var a = getUniqueValues(generatedData.papers, SUB_DATASETS[subset]), objarr = [];
    for (var i in a) {
      objarr.push({
        propertyName: SUB_DATASETS[subset],
        title: slugify(a[i]),
        value: a[i]
      });
    }

    _stream = _stream.pipe(
      gulpFile(
        (Array.isArray(SUB_DATASETS[subset]) ? SUB_DATASETS[subset].join('_') : SUB_DATASETS[subset])
        + '.json',
        JSON.stringify(objarr)
        ));
  }

  return _stream.pipe(gulp.dest('source/data'));
});

gulp.task('lunr', ['json'], function() {
  compileData();

  util.log(util.colors.magenta('****'), 'Generating search indices...', util.colors.magenta('****'));

  var index = lunr(function() {
    this.field('title', {
      boost: 10
    });
    this.field('abstract');
  });

  var papers = generatedData.papers;

  try {
    papers.forEach(function(p) {
      index.add(p);
    });

    var _stream = gulpFile('searchindex.json', JSON.stringify({
      index: index.toJSON(),
      papers: papers
    }), {
      src: true
    });

    util.log(util.colors.blue(':):)'),
      util.colors.gray('Main Index'),
      '(', papers.length, 'items', ')',
      util.colors.blue('):):'));

    // create a subset of papers, and corresponding search index for each category in the generated data
    for (var c in generatedData.categories) {
      if (generatedData.categories[c].custom_filter) {
        var _data = matchObjects(generatedData.papers, ['taxonomy', 'category'], generatedData.categories[c].custom_filter);

        util.log(util.colors.green('>>>>'),
          generatedData.categories[c].custom_filter,
          '(', _data.length, 'items', ')',
          util.colors.green('>>>>'));

        var _idx = lunr(function() {
          this.field('title', {
            boost: 10
          });
          this.field('abstract');
        });
        _data.forEach(function(p) {
          _idx.add(p);
        });

        _stream = _stream.pipe(
          gulpFile(
            'searchindex-' + slugify(generatedData.categories[c].custom_filter) + '.json',
            JSON.stringify({
              index: _idx.toJSON(),
              papers: _data
            })
            ));
      }
    }

    // add a file enumerating all of the available scopes
    // right now this is just generatedData.categories
    _stream = _stream.pipe(
      gulpFile(
        'scopes.json',
        JSON.stringify(generatedData.categories)
        ));

    return _stream.pipe(gulp.dest('source/js'));

  } catch (e) {
    if (!papers) {
      util.log(util.colors.red('!!!!'), util.colors.red('generatedData.papers is falsey, which probably means papers.json does not exist'), util.colors.red('!!!!'));
      util.log(util.colors.red('!!!!'), util.colors.red('try running "gulp csv2json" before you run this task'), util.colors.red('!!!!'));
    }
    util.log(util.colors.red('!!!!'), util.colors.red('error:'), util.colors.magenta(e.name), ':', util.colors.magenta(e.message), util.colors.red('!!!!'));
    util.log(util.colors.red('!!!!'), util.colors.red('file:'), util.colors.magenta(e.fileName), util.colors.red('!!!!'));
    util.log(util.colors.red('!!!!'), util.colors.red('line:'), util.colors.magenta(e.lineNumber), util.colors.red('!!!!'));
    util.log(util.colors.red('!!!!'), util.colors.gray(e.stack), util.colors.red('!!!!'));
  }
});


var buildTasks = ['sass', 'js', 'img', 'nunjucks', 'libCss', 'lunr'];
gulp.task('build', buildTasks, function () {
  util.log(util.colors.magenta('****'), 'Finished running build tasks:', buildTasks, util.colors.magenta('****'));
})

gulp.task('deploy', ['build'], shell.task([
  'git subtree push --prefix public origin gh-pages'
  ])
);

gulp.task('html-watch', ['nunjucks'], function() { bs.reload(); });

gulp.task('default', ['bs', 'build'], function (){
  gulp.watch('source/sass/**/*.scss', ['sass']);
  gulp.watch('source/templates/*.html', ['html-watch']);
  gulp.watch('source/img/**/*', ['img']);
  gulp.watch('source/js/**/*', ['js']);
});
