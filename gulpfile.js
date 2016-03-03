var gulp            = require('gulp-help')(require('gulp'), {hideDepsMessage: true}),
    manifest        = require('asset-builder')('./assets/manifest.json'),
    gulpLoadPlugins = require('gulp-load-plugins'),
    merge           = require('merge-stream'),
    argv            = require('yargs').argv,
    pngquant        = require('imagemin-pngquant'),
    browserSync     = require('browser-sync').create(),
    fs              = require('fs'),
    critical        = require('critical'),
    plugins         = gulpLoadPlugins();

var path       = manifest.paths, //path.source, path.dest etc
    globs      = manifest.globs, //globs.images, globs.bower etc
    config     = manifest.config || {},
    production = argv.production || false,
    minify     = (production ? true : false),
    allowlint  = argv.allowlint || false,
    stagingUrl = argv.stagingUrl || false;

var gulpHelp = {
  styles         : 'Compile and concat SCSS to CSS with sourcemaps and autoprefixer. Also runs styles:lint.',
  stylesLint     : 'Lints all SCSS files.',
  stylesCritical : 'Generates the Critical CSS file based on dimentions in the array.',
  scripts        : 'Concat js files with sourcemaps. Also runs scripts:lint.',
  scriptsLint    : 'Lints all js files.',
  images         : 'Compress JPG and PNG files.',
  svgs           : 'Minify SVG files. Also runs svg:sprite.',
  svgSprite      : 'Concat and minify SVG files in to a single SVG sprite file.',
  fonts          : 'Copy the fonts directory to dist.',
  phpLint        : 'Lint theme PHP files based on PSR-2.',
  clean          : 'Deletes the dist directory.',
  build          : 'Main build task. Runs styles, scripts, images, svgs, fonts and php:lint. Does NOT delete dist directory.',
  watch          : 'Watch SCSS, JS, SVG and PHP files. Uses browserSync via proxy.',
  default        : 'Runs the build task. Deleting the dist directory first.'
};

//Override standard gulp.src task
//Use notify and gulp util as error notifcation
var _gulpsrc = gulp.src;
gulp.src = function() {
  return _gulpsrc.apply(gulp, arguments)
    .pipe(plugins.if(!production, plugins.plumber({
      errorHandler: function(err) {
        //plugins.notify.onError("Error: <%= error.message %>")(err);
        plugins.notify.onError("Error: " + err.toString())(err);
        this.emit('end');
      }
    }))); // Seriously?
};

//Compile SCSS to CSS
gulp.task('styles', gulpHelp.styles, ['styles:lint'], function() {
  var merged = merge();

  manifest.forEachDependency('css', function(dep) {
    dep.globs.forEach(function (path) {
      try {
        fs.accessSync(path);
      } catch (e) {
        plugins.util.log(plugins.util.colors.red('Warning! ' + path + ' does not exist.'));
      }
    });

    merged.add(
      gulp.src(dep.globs)
      .pipe(plugins.sourcemaps.init({loadMaps: true}))
      .pipe(plugins.sass({ style: 'nested' }))
      .pipe(plugins.concat(dep.name))
      .pipe(plugins.if(minify, plugins.cssnano())) //If prod minify
    );
  });
  return merged

  .pipe(plugins.autoprefixer({
    browsers: ['last 2 versions']
  }))
  .pipe(plugins.sourcemaps.write('.'))
  .pipe(gulp.dest(path.dist + '/css'))
  .pipe(browserSync.reload({stream:true}))
  .pipe(plugins.if(!production, plugins.notify({
      "subtitle": "Task Complete",
      "message": "Styles task complete",
      "onLast": true
    })));
}, {
  options: {
    'production': 'Minified without sourcemaps.'
  }
});

// Lints scss files
gulp.task('styles:lint', gulpHelp.stylesLint, function() {
  return gulp.src(path.source + 'styles/**/*.scss')
    .pipe(plugins.sassLint())
    .pipe(plugins.sassLint.format())
    .pipe(plugins.if(production, plugins.if(!allowlint, plugins.sassLint.failOnError())));
}, {
  options: {
    'production': 'Fail on error.',
    'allowlint': 'Do not fail on error, when used with --production.'
  }
});

// Critical path css
gulp.task('styles:critical', ['styles', 'styles:lint'], function() {
  return critical.generate({
    src: plugins.if(stagingUrl, config.stagingUrl, config.devUrl),
    dest: path.dist + '/css/critical.css',
    ignore: ['@font-face',/url\(/],
    // pathPrefix: '/wp-content/themes/tofino/' + path.dist + 'fonts',
    minify: true,
    dimensions: [{
      height: 627,
      width: 370
    }, {
      height: 900,
      width: 1200
    }]
  });
});

// Concatenate & Minify JS
gulp.task('scripts', gulpHelp.scripts, ['scripts:lint'], function() {
  var merged = merge();

  manifest.forEachDependency('js', function(dep) {
    dep.globs.forEach(function (path) {
      try {
        fs.accessSync(path);
      } catch (e) {
        plugins.util.log(plugins.util.colors.red('Warning! ' + path + ' does not exist.'));
      }
    });

    merged.add(
      gulp.src(dep.globs, {base: 'scripts', merge: true})
        .pipe(plugins.sourcemaps.init({loadMaps: true}))
        .pipe(plugins.concat(dep.name))
        .pipe(plugins.if(minify, plugins.uglify())) //If prod minify
        .pipe(plugins.sourcemaps.write('.'))
    )
    .pipe(gulp.dest(path.dist + '/js'));
  });

  return merged
  .pipe(plugins.if(!argv.production, plugins.notify({
      "subtitle": "Task Complete",
      "message": "Scripts task complete",
      "onLast": true
    })));
}, {
  options: {
    'production': 'Minified without sourcemaps.'
  }
});

// Lints configuration JSON and project JS.
gulp.task('scripts:lint', gulpHelp.scriptsLint, function() {
  return gulp.src(path.scripts + '/**/*.js')
    .pipe(plugins.jshint())
    .pipe(plugins.jshint.reporter('jshint-stylish'))
    .pipe(plugins.if(production, plugins.if(!allowlint, plugins.jshint.reporter('fail'))))
    .pipe(plugins.jscs())
    .pipe(plugins.jscs.reporter());
}, {
  options: {
    'production': 'Fail on error.',
    'allowlint': 'Do not fail on error, when used with --production.'
  }
});

// Min / Crush images
gulp.task('images', gulpHelp.images, function () {
  return gulp.src(globs.images)
    .pipe(plugins.newer(path.dist + 'img'))
    .pipe(plugins.imagemin({
      progressive: true,
      use: [pngquant()]
    }))
    .pipe(gulp.dest(path.dist + 'img'))
    .pipe(plugins.if(!production, plugins.notify("Images task complete")));
});

//Minify SVGS + run sprite task
gulp.task('svgs', gulpHelp.svgs, ['svg:sprite'], function () {
  return gulp.src(path.svgs + '*.svg')
    .pipe(plugins.svgmin())
    .pipe(gulp.dest(path.dist + 'svg'));
});

// Convert SVGs to Sprites
gulp.task('svg:sprite', gulpHelp.svgSprite, function () {
  return gulp.src(path.svgs + 'sprites/*.svg')
    .pipe(plugins.svgmin())
    .pipe(plugins.svgSprite({
      mode: {
        symbol: {
          dest: '.' //Sets default path (svg) and stopped the folders nesting.
        }
      }
    }))
    .pipe(gulp.dest(path.dist))
    .pipe(plugins.if(!production, plugins.notify("SVG task complete")));
});

//Copy font files from assets to dist
gulp.task('fonts', gulpHelp.fonts, function () {
  return gulp.src(path.fonts + '*')
    .pipe(gulp.dest(path.dist + 'fonts'));
});

//Lint PHP files using ruleset.xml.
gulp.task('php:lint', gulpHelp.phpLint, function () {
  return gulp.src(['**/*.php', '!vendor/**/*.*', '!tests/**/*.*'])
    .pipe(plugins.phpcs({ // Validate files using PHP Code Sniffer
      bin: 'vendor/bin/phpcs',
        standard: 'ruleset.xml',
        warningSeverity: 0
      }))
    .pipe(plugins.if(!production, plugins.phpcs.reporter('log')))
    .pipe(plugins.if(production, plugins.if(!allowlint, plugins.phpcs.reporter('fail'))));
}, {
  options: {
    'production': 'Fail on error.',
    'allowlint': 'Do not fail on error, when used with --production.'
  }
});

// Deletes the build folder entirely.
gulp.task('clean', gulpHelp.clean, require('del').bind(null, [path.dist]));

// Generic build task. Use with '--production' for minified js / css
gulp.task('build', gulpHelp.build, ['images', 'svgs', 'styles', 'scripts', 'fonts', 'php:lint']);

// Watch Files For Changes
gulp.task('watch', gulpHelp.watch, function() {

  var ghost = false;

  //if gulp watch --chill then BrowserSync will not pass clicks, forms, scroll to other browsers.
  if(argv.chill) {
    ghost = true;
  }

  browserSync.init({
    files: ['{lib,templates}/**/*.php', '*.php'],
    proxy: config.devUrl,
    ghostMode: ghost,
    snippetOptions: {
      whitelist: ['/wp-admin/admin-ajax.php'],
      blacklist: ['/wp-admin/**']
    }
  });

  plugins.util.log('Watching source files for changes... Press ' + plugins.util.colors.cyan('CTRL + C') + ' to stop.');

  gulp.watch(path.source + 'styles/**/*.scss', ['styles']).on('change', function(file) {
    plugins.util.log('SCSS file changed: ' + file.path + '');
  });

  gulp.watch(path.svgs + '**/*.svg', ['svgs']).on('change', function(file) {
    plugins.util.log('SVG file changed: ' + file.path + '');
  });

  gulp.watch(path.images + '*.*', ['images']).on('change', function(file) {
    plugins.util.log('Image file changed: ' + file.path + '');
  });

  gulp.watch(path.scripts + '*.js', ['scripts']).on('change', function(file) {
    plugins.util.log('JS file changed: ' + file.path + '');
  });

  gulp.watch(['**/*.php', '!vendor/**/*.php'], ['php:lint']); //No need to log the filename. BrowserSync does this.

}, {
  options: {
    'chill': 'Do not pass clicks, forms or scroll to other browsers.'
  }
});

gulp.task('default', gulpHelp.default, ['clean'], function() {
  gulp.start('build');
});
